// A stand-in for an OpenAI-compatible AI, for the Quick capture test (port 8020).
// It lists one model, answers "ok" to Test connection, and reads "Met <name> at …" as one
// new person, with "likes climbing" as a memory aid about them.
import http from 'node:http'

const PORT = 8020

function capture(text) {
  const name = /Met (.+?) at /.exec(text)?.[1] ?? 'Someone'
  return {
    people: [{ ref: 'p1', name, how_we_met: null, work: null, birthday: null, tags: [] }],
    connections: [],
    memory_aids: /likes climbing/i.test(text) ? [{ about: 'p1', text: 'Likes climbing' }] : [],
    entries: [],
  }
}

function reply(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json' })
  response.end(JSON.stringify(body))
}

http
  .createServer(async (request, response) => {
    if (request.method === 'GET' && request.url === '/v1/models') {
      return reply(response, 200, { data: [{ id: 'fake-model' }] })
    }
    if (request.method === 'POST' && request.url === '/v1/chat/completions') {
      let raw = ''
      for await (const chunk of request) raw += chunk
      const { messages } = JSON.parse(raw)
      const text = messages.at(-1).content
      const content = text.startsWith('Today is ') ? JSON.stringify(capture(text)) : 'ok'
      return reply(response, 200, { choices: [{ message: { role: 'assistant', content } }] })
    }
    reply(response, 404, { error: 'not found' })
  })
  .listen(PORT, () => console.log(`Fake AI on http://localhost:${PORT}/v1`))
