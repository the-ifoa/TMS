require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH || undefined })
const fs = require('fs')
const path = require('path')
const { ImapFlow } = require('imapflow')
const { simpleParser } = require('mailparser')

// One-off: pull every mail out of the mailbox's inbox and dump
// sender/subject/date/body to JSON so the review text can be lifted by hand.
// Uses SMTP_HOST / SMTP_USER / SMTP_PASS (IMAP on port 993 of the same host).
// Output: backend/inbox-export.json (git-ignored — it holds private mail).
async function main() {
  const client = new ImapFlow({
    host: process.env.SMTP_HOST,
    port: 993,
    secure: true,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    },
    logger: false
  })

  await client.connect()
  const results = []

  const lock = await client.getMailboxLock('INBOX')
  try {
    for await (const message of client.fetch('1:*', { source: true, envelope: true })) {
      if (!message.source) {
        console.error('No source for uid', message.uid, Object.keys(message))
        continue
      }
      const parsed = await simpleParser(message.source)
      results.push({
        uid: message.uid,
        from: parsed.from?.text || '',
        subject: parsed.subject || '',
        date: parsed.date || null,
        text: parsed.text || '',
        html: parsed.html || null
      })
    }
  } finally {
    lock.release()
  }

  await client.logout()

  const outPath = path.join(__dirname, '..', 'inbox-export.json')
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2))
  console.log(`Fetched ${results.length} mails -> ${outPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
