import { Sandbox } from '@e2b/code-interpreter';

export const maxDuration = 60;

const RUNNERS = {
  python: { file: 'main.py', cmd: 'python3 main.py' },
  javascript: { file: 'index.js', cmd: 'node index.js' },
  cpp: { file: 'main.cpp', cmd: 'g++ -O2 main.cpp -o main && ./main' },
  c: { file: 'main.c', cmd: 'gcc -O2 main.c -o main && ./main' },
  java: { file: 'Main.java', cmd: 'javac Main.java && java Main' },
  bash: { file: 'script.sh', cmd: 'bash script.sh' }
};

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { language, code } = req.body;
  if (!code) return res.status(400).json({ error: 'No source code provided.' });
  if (!process.env.E2B_API_KEY) return res.status(500).json({ error: 'E2B_API_KEY missing.' });

  const runner = RUNNERS[language.toLowerCase()] || RUNNERS.python;

  let sbx;
  try {
    sbx = await Sandbox.create({ apiKey: process.env.E2B_API_KEY });
    await sbx.files.write(runner.file, code);

    const execution = await sbx.commands.run(runner.cmd, { timeoutMs: 15000 });
    await sbx.kill();

    const output = (execution.stdout || '') + (execution.stderr ? (execution.stdout ? '\n' : '') + execution.stderr : '');
    return res.status(200).json({
      output: output || '[Process exited cleanly with no output]',
      exitCode: execution.error ? 1 : 0
    });
  } catch (err) {
    if (sbx) await sbx.kill().catch(() => {});
    return res.status(500).json({ error: `E2B Execution Failed: ${err.message}` });
  }
}