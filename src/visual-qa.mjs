/**
 * Visual QA: use an external vision model API to evaluate a screenshot.
 *
 * Omni does not re-implement browser automation; it consumes screenshots
 * produced by DSH's installed browser tools (e.g. dsh-trio browser_screenshot)
 * and sends them to a configured OpenAI-compatible vision endpoint.
 */

export function isFrontendTask(taskText = '') {
  return /(前端|frontend|ui|页面|component|网页|html|css|react|vue|web)/i.test(String(taskText || ''))
}

export function buildVisualQaStepRequirement() {
  return 'MANDATORY VISUAL QA: This is a frontend/UI task and you are in the validate phase. You MUST: (1) use browser_screenshot to capture the current page, (2) call omni_visual_check with the screenshot path and the task requirement, (3) only finish when the visual QA returns "VISUAL_QA: PASS". If it returns FAIL, fix the issues and re-run screenshot + visual check. Do not report step completion without a PASS.'
}

export function buildVisualQaPrompt(requirement = '') {
  return `You are a strict visual QA reviewer. Look at the screenshot and evaluate it against the requirement.

Requirement:
${requirement || '(no explicit requirement — assess general visual quality, layout, readability, and rendering correctness)'}

Report:
1. Overall verdict: PASS or FAIL.
2. Findings by severity (critical / high / medium / low): describe each issue with location (e.g. top-right HUD, center canvas, color contrast).
3. One-line fix suggestion per finding.
4. End with "VISUAL_QA: PASS" or "VISUAL_QA: FAIL".`
}

export function buildVisualQaRequest({ apiUrl, apiKey, model, imageBase64, prompt }) {
  return {
    url: apiUrl || 'https://api.openai.com/v1/chat/completions',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey || ''}`,
    },
    body: JSON.stringify({
      model: model || 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${imageBase64}` } },
          ],
        },
      ],
      max_tokens: 800,
    }),
  }
}

export async function callVisionApi({ apiUrl, apiKey, model, imageBase64, prompt }) {
  const req = buildVisualQaRequest({ apiUrl, apiKey, model, imageBase64, prompt })
  const res = await fetch(req.url, {
    method: 'POST',
    headers: req.headers,
    body: req.body,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`vision API ${res.status}: ${text.slice(0, 500)}`)
  }
  const data = await res.json()
  return data?.choices?.[0]?.message?.content || ''
}

export function parseVisualQaResponse(text) {
  const source = String(text || '')
  const pass = /VISUAL_QA:\s*PASS/i.test(source)
  const fail = /VISUAL_QA:\s*FAIL/i.test(source)
  const findings = source
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => /critical|high|medium|low|fix|issue|problem/i.test(line))
    .slice(0, 10)
  return {
    verdict: fail ? 'fail' : pass ? 'pass' : 'unknown',
    findings,
    raw: source,
  }
}
