/**
 * api/_lib/jev/jev-guardrails.js - Multi-Vector Threat Analysis & Security Shield
 * Detects destructive commands, credential exfiltration, and prompt injection attacks.
 */

/**
 * Screen shell and terminal commands before execution in sandboxes or microVMs.
 * @param {string} command 
 * @returns {{ safe: boolean, p: number, threatCategory: string, reason: string }}
 */
export function inspectJevCommandSafety(command = '') {
  const cmd = String(command).trim();
  const cLower = cmd.toLowerCase();

  // 1. Destructive filesystem deletions
  const isDestructiveFs =
    /rm\s+(-[rfRF]{1,4}\s+[/~*]|--no-preserve-root)/i.test(cLower) ||
    cLower.includes('rm -rf /') ||
    cLower.includes('rm -rf ~') ||
    cLower.includes('rm -rf *') ||
    cLower.includes('rm -r /') ||
    cLower.includes('rm -r *') ||
    /\b(rmdir|rd)\s+\/s\s+\/q/i.test(cLower) ||
    /\bdel\s+\/f\s+\/s\s+\/q\s+[c-z]:\\/i.test(cLower) ||
    /\b(shred|wipefs)\s+(-[a-z]*\s+)?(\/dev\/|\/)/i.test(cLower);

  // 2. Storage & partition formatting
  const isPartitionDestroy =
    cLower.includes('format c:') ||
    /mkfs\.(ext[234]|xfs|btrfs|ntfs|vfat|fat)\s+/i.test(cLower) ||
    /dd\s+if=.*of=\/dev\/(sd[a-z]|nvme|hd[a-z]|mapper|vd[a-z])/i.test(cLower) ||
    /\bfdisk\s+\/dev\//i.test(cLower);

  // 3. Denial of service, fork bombs, and system crashes
  const isDosOrCrash =
    cLower.includes(':(){ :|:& };:') ||
    cLower.includes(':(){ :|:&};:') ||
    /\b(killall\s+-9\s+(systemd|init)|kill\s+-9\s+1\b)/i.test(cLower) ||
    /\b(shutdown\s+-h\s+now|init\s+0|reboot\s+-f)\b/i.test(cLower);

  // 4. Database wipe operations
  const isDbWipe =
    /\b(drop\s+database\s+[a-z0-9_]+|drop\s+table\s+[a-z0-9_]+|truncate\s+table\s+[a-z0-9_]+)\b/i.test(cLower);

  // 5. Credential & secret exfiltration via network pipe
  const isExfiltration =
    cLower.includes('/etc/shadow') ||
    cLower.includes('/etc/passwd') ||
    cLower.includes('.ssh/id_rsa') ||
    cLower.includes('printenv | curl') ||
    cLower.includes('printenv | nc') ||
    cLower.includes('env | curl') ||
    cLower.includes('env | nc') ||
    /\b(curl|wget|fetch|nc|ncat)\b.*(leak|exfil|evil|\$|token|key|secret)/i.test(cLower) ||
    /(?:upload|post|send)\s+.*(?:api[_-]?key|secret|password|credential|token)\s+to\s+https?:\/\//i.test(cLower);

  // 6. Dangerous root permission alterations
  const isPermExploit =
    /\bchmod\s+(-R\s+)?777\s+\//i.test(cLower) ||
    /\bchown\s+(-R\s+)?root:root\s+\//i.test(cLower);

  if (isDestructiveFs || isPartitionDestroy || isDosOrCrash || isDbWipe || isPermExploit) {
    return {
      safe: false,
      p: 0.02,
      threatCategory: 'destructive_command',
      reason: isPartitionDestroy
        ? 'Partition destruction or disk format attempt detected.'
        : isDosOrCrash
        ? 'Fork bomb, crash exploit, or unauthorized system shutdown detected.'
        : isDbWipe
        ? 'Destructive database drop or truncate command detected.'
        : isPermExploit
        ? 'Unsafe system-wide permission escalation detected.'
        : 'Irreversible filesystem wipe attempt detected (rm -rf / root level).'
    };
  }

  if (isExfiltration) {
    return {
      safe: false,
      p: 0.05,
      threatCategory: 'credential_exfiltration',
      reason: 'Unauthorized secret token, password, or environment exfiltration detected.'
    };
  }

  return {
    safe: true,
    p: 0.98,
    threatCategory: 'none',
    reason: 'Command satisfies Jev System-1 sandbox safety policy.'
  };
}

export function inspectJevGuardrails(prompt = '') {
  const p = String(prompt).toLowerCase();

  // Check command safety first
  const cmdSafety = inspectJevCommandSafety(p);
  if (!cmdSafety.safe) {
    return {
      guardrailPassed: false,
      threatCategory: cmdSafety.threatCategory,
      threatDetail: cmdSafety.reason
    };
  }

  const isPromptInjection =
    p.includes('ignore all previous instructions') ||
    p.includes('ignore previous instructions') ||
    p.includes('system prompt override') ||
    p.includes('act as dan') ||
    p.includes('disregard safety protocols') ||
    p.includes('bypass all guardrails') ||
    p.includes('jailbreak prompt') ||
    /(reveal|dump|print)\s+(your\s+)?(system\s+prompt|initial\s+instructions)/i.test(p);

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
