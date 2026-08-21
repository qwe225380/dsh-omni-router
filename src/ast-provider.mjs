/**
 * AST Provider: optional tree-sitter based static analysis.
 *
 * Uses `web-tree-sitter` + `tree-sitter-wasms` when installed (they are
 * optional dependencies). Falls back to the lightweight dependency-graph
 * parser when the WASM runtime is unavailable, so the rest of Omni keeps
 * working without native toolchains.
 */

import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

import { buildEdgesFromIndexed } from './dependency-graph.mjs'

const require = createRequire(import.meta.url)

const LANGUAGE_BY_EXT = {
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.cs': 'c_sharp',
  '.rb': 'ruby',
  '.php': 'php',
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.hpp': 'cpp',
  '.css': 'css',
  '.html': 'html',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.vue': 'vue',
}

let parserPromise = null
const languageCache = new Map()

export function languageForPath(filePath) {
  const ext = path.extname(String(filePath || '')).toLowerCase()
  return LANGUAGE_BY_EXT[ext] || 'javascript'
}

async function loadParserModule() {
  if (parserPromise) return parserPromise
  parserPromise = (async () => {
    const mod = await import('web-tree-sitter')
    const Parser = mod.default || mod
    await Parser.init()
    return Parser
  })()
  return parserPromise
}

function wasmPathFor(language) {
  try {
    const pkgRoot = path.dirname(require.resolve('tree-sitter-wasms/package.json'))
    return path.join(pkgRoot, 'out', `tree-sitter-${language}.wasm`)
  } catch {
    return null
  }
}

async function loadLanguage(language) {
  if (languageCache.has(language)) return languageCache.get(language)
  const Parser = await loadParserModule()
  const wasm = wasmPathFor(language)
  if (!wasm || !fs.existsSync(wasm)) {
    const err = new Error(`No tree-sitter wasm for ${language}`)
    languageCache.set(language, err)
    throw err
  }
  try {
    const lang = await Parser.Language.load(wasm)
    languageCache.set(language, lang)
    return lang
  } catch (error) {
    languageCache.set(language, error)
    throw error
  }
}

function stripQuotes(text = '') {
  return String(text).replace(/^['"]|['"]$/g, '')
}

function dedupe(list, keyFn = (x) => JSON.stringify(x)) {
  const seen = new Set()
  const out = []
  for (const item of list) {
    const key = keyFn(item)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

function collectFromTree(tree) {
  const definitions = []
  const imports = []
  const calls = []
  const inheritance = []

  const visit = (node, exported = false) => {
    if (!node) return
    const isExport = node.parent?.type === 'export_statement'
    const isExported = exported || isExport

    if (node.type === 'function_declaration' || node.type === 'generator_function_declaration') {
      const name = node.childForFieldName('name')?.text
      if (name) definitions.push({ name, kind: 'function', exported: isExported })
    } else if (node.type === 'class_declaration') {
      const name = node.childForFieldName('name')?.text
      if (name) definitions.push({ name, kind: 'class', exported: isExported })
      const heritage = node.namedChildren.find((c) => c.type === 'class_heritage')
      if (heritage) {
        for (const child of heritage.namedChildren) {
          if (child.type === 'extends_clause') {
            for (const id of child.namedChildren) {
              if (id.type === 'identifier' || id.type === 'type_identifier') {
                inheritance.push({ name, kind: 'extends', target: id.text })
              }
            }
          } else if (child.type === 'implements_clause') {
            for (const id of child.namedChildren) {
              if (id.type === 'identifier' || id.type === 'type_identifier') {
                inheritance.push({ name, kind: 'implements', target: id.text })
              }
            }
          } else if (child.type === 'identifier' || child.type === 'type_identifier') {
            inheritance.push({ name, kind: 'extends', target: child.text })
          }
        }
      }
    } else if (node.type === 'lexical_declaration' || node.type === 'variable_declaration') {
      for (const decl of node.namedChildren) {
        if (decl.type === 'variable_declarator') {
          const name = decl.childForFieldName('name')?.text
          if (name) definitions.push({ name, kind: 'variable', exported: isExported })
        }
      }
    } else if (node.type === 'interface_declaration') {
      const name = node.childForFieldName('name')?.text
      if (name) definitions.push({ name, kind: 'interface', exported: isExported })
      for (const child of node.namedChildren) {
        if (child.type === 'extends' || child.type === 'extends_type_clause') {
          for (const id of child.namedChildren) {
            if (id.type === 'identifier' || id.type === 'type_identifier') {
              inheritance.push({ name, kind: 'extends', target: id.text })
            }
          }
        }
      }
    } else if (node.type === 'type_alias_declaration') {
      const name = node.childForFieldName('name')?.text
      if (name) definitions.push({ name, kind: 'type', exported: isExported })
    }

    if (node.type === 'import_statement') {
      const source = node.childForFieldName('source')?.text
      if (source) imports.push(stripQuotes(source))
    }

    if (node.type === 'call_expression') {
      const fn = node.childForFieldName('function')
      if (fn) {
        if (fn.type === 'identifier' && fn.text === 'require') {
          const args = node.childForFieldName('arguments')
          const first = args?.namedChildren?.[0]
          if (first?.type === 'string') imports.push(stripQuotes(first.text))
        } else if (fn.type === 'identifier') {
          calls.push(fn.text)
        } else if (fn.type === 'member_expression') {
          const prop = fn.namedChildren[fn.namedChildren.length - 1]
          if (prop) calls.push(prop.text)
        }
      }
    }

    for (const child of node.namedChildren) visit(child, isExported)
  }

  visit(tree.rootNode, false)

  return {
    definitions: dedupe(definitions, (d) => `${d.kind}:${d.name}:${d.exported}`),
    imports: dedupe(imports),
    calls: dedupe(calls),
    inheritance: dedupe(inheritance, (r) => `${r.kind}:${r.name}:${r.target}`),
  }
}

/**
 * Parse a single source file with tree-sitter if available.
 * Returns the same shape as dependency-graph's indexed entry.
 */
export async function parseSourceWithTreeSitter(source, language = 'javascript') {
  const Parser = await loadParserModule()
  const lang = await loadLanguage(language)
  const parser = new Parser()
  parser.setLanguage(lang)
  const tree = parser.parse(String(source || ''))
  return collectFromTree(tree)
}

/**
 * Build a whole-repository graph using tree-sitter when available.
 * Falls back to dependency-graph for files/languages tree-sitter cannot parse.
 */
export async function buildAstGraph(files = {}, options = {}) {
  const indexed = {}
  const useTreeSitter = options.useTreeSitter !== false
  for (const [filePath, content] of Object.entries(files)) {
    const language = languageForPath(filePath)
    if (useTreeSitter) {
      try {
        indexed[filePath] = await parseSourceWithTreeSitter(content, language)
        continue
      } catch {
        // fall through to lightweight parser
      }
    }
    const { extractDefinitions, extractImports, extractCalls, extractInheritance } = await import('./dependency-graph.mjs')
    indexed[filePath] = {
      definitions: extractDefinitions(content),
      imports: extractImports(content),
      calls: extractCalls(content),
      inheritance: extractInheritance(content),
    }
  }
  return { files: indexed, edges: buildEdgesFromIndexed(indexed) }
}
