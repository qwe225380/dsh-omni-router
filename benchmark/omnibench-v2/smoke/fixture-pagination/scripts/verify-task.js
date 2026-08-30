'use strict'

/**
 * Independent hidden verifier for the smoke pagination task.
 *
 * Exit-code contract:
 *   0  → bug fixed (last page returns the remaining items)
 *   1  → bug present (last page empty)
 *   >=2 → infrastructure error (verifier cannot run)
 */

const fs = require('fs')
const path = require('path')

const srcFile = path.join(__dirname, '..', 'src', 'pagination.js')
if (!fs.existsSync(srcFile)) {
  console.error('VERIFIER INFRA: missing src/pagination.js')
  process.exit(2)
}

try {
  const { paginate } = require(srcFile)
  const items = Array.from({ length: 10 }, (_, i) => i + 1)
  const result = paginate(items, 3, 4)
  const expected = items.slice(9) // last page = [10]
  if (JSON.stringify(result) === JSON.stringify(expected)) {
    console.log('PAGINATION OK: last page returns remaining items')
    process.exit(0)
  }
  console.log('PAGINATION BUG PRESENT: expected', JSON.stringify(expected), 'got', JSON.stringify(result))
  process.exit(1)
} catch (error) {
  console.error('VERIFIER INFRA:', error.message)
  process.exit(2)
}