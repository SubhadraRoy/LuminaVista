/**
 * api/_lib/jev/jev-guardrails.js - Multi-Vector Threat Analysis & Security Shield
 * Detects destructive commands, credential exfiltration, and prompt injection attacks.
 */

export function inspectJevGuardrails(prompt = '') {
  const p = String(prompt).toLowerCase();

  const isDestructive =
    /rm\s+(-[rfRF]{1,4}\s+[/~*]|--no-preserve-root)/i.test(p) ||
    p.includes('rm -rf /') ||
    p.includes('rm -rf ~') ||
    p.includes('rm -rf *') ||
    p.includes('drop database') ||
    p.includes('format c:') ||
    p.includes(':(){ :|:& };:') ||
    /mkfs\.(ext[234]|xfs|btrfs|ntfs|vfat)\s+/i.test(p) ||
    /dd\s+if=.*of=\/dev\/(sd[a-z]|nvme|hd[a-z])/i.test(p);

  const isExfiltration =
    p.includes('/etc/shadow') ||
    p.includes('/etc/passwd') ||
    p.includes('.ssh/id_rsa') ||
    p.includes('printenv | curl') ||
    p.includes('env | nc ') ||
    /\b(curl|wget|fetch|nc|ncat)\b.*(leak|exfil|evil|\$|token|key|secret)/i.test(p) ||
    /(?:upload|post|send)\s+.*(?:api[_-]?key|secret|password|credential|token)\s+to\s+https?:\/\//i.test(p);

  const isPromptInjection =
    p.includes('ignore all previous instructions') ||
    p.includes('ignore previous instructions') ||
    p.includes('system prompt override') ||
    p.includes('act as dan') ||
    p.includes('disregard safety protocols') ||
    p.includes('bypass all guardrails') ||
    p.includes('jailbreak prompt') ||
    /(reveal|dump|print)\s+(your\s+)?(system\s+prompt|initial\s+instructions)/i.test(p);

  if (isDestructive) {
    return {
      guardrailPassed: false,
      threatCategory: 'destructive_command',
      threatDetail: 'Blocked attempt to execute system-destructive or irreversible command.'
    };
  }

  if (isExfiltration) {
    return {
      guardrailPassed: false,
      threatCategory: 'credential_exfiltration',
      threatDetail: 'Blocked potential credential, secret, or system configuration exfiltration attempt.'
    };
  }

  if (isPromptInjection) {
    return {
      guardrailPassed: false,
      threatCategory: 'prompt_injection',
      threatDetail: 'Blocked adversarial prompt injection or system instruction override attempt.'
    };
  }

  return {
    guardrailPassed: true,
    threatCategory: 'none',
    threatDetail: ''
  };
}
