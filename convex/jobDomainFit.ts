// Retain the established specialist buckets and 2/3/4-bucket thresholds.
// Ordinary database/API/microservice work and application on-call are not buckets.
// Infra stack names count only with explicit ownership/expertise, not mere use.
const INFRA_BACKEND_TITLE = /\b(backend|back[-\s]?end|infrastructure|platform|kubernetes|devops|site reliability|sre|security|inference|database|data platform|storage|network|networking|connectivity|cdn|edge infrastructure|edge networking|content delivery)\b/i;
const PRODUCT_FACING_WORK = /\b(product engineer|product[-\s]?minded|full[-\s]?stack|frontend|front[-\s]?end|web app|user[-\s]?facing|customer[-\s]?facing|product surface|growth|gtm|internal tools|workflow|developer experience|devtools?|sdk|api product)\b/i;
const SPECIALIST_BUCKETS = [
  /\bdistributed systems?\b/i,
  /\b(devops|site reliability|sre|incident response)\b/i,
  /\b(platform engineering|cloud infrastructure|fleet|orchestration|autoscaling)\b/i,
  /\b(cdn|content delivery|edge infrastructure|edge networking|edge caching|traffic routing|global traffic|internet traffic|packet|packets)\b/i,
  /\b(high[-\s]?qps|p9[59]|tail latency|low latency|high performance computing|multi[-\s]?region|load balancing|request routing|traffic management)\b/i,
  /\b(storage backends?|cdc|consistency|failover|indexing|retrieval)\b/i,
  /\b(inference infrastructure|model serving|accelerators?|gpu|tpu|hardware[-\s]?agnostic)\b/i,
];
const OWNED_INFRA = /\b(?:own|provision|operate|manage|maintain|administer|build|design)\s+(?:(?:the|our)\s+)?(?:(?:provisioning|operation)(?:\s+and\s+(?:provisioning|operation))?\s+of\s+)?(?:kubernetes clusters?|k8s clusters?|terraform infrastructure|cloud infrastructure|inference infrastructure|model serving|cdn|content delivery|edge networking)\b/i;
const PERFORMANCE_WORK = /\b(?:design|build|optimize)\b[^.!?\n]{0,100}\bdistributed systems?\b[^.!?\n]{0,100}\b(?:high[-\s]?qps|tail latency|low[-\s]?latency|request routing|load balancing|multi[-\s]?region)\b/i;
const DEEP_SPECIALIZATION = /\b(?:deep (?:expertise|specialization|knowledge|understanding)|expert[-\s]?level)\b[^.!?\n]{0,100}\b(?:high[-\s]?qps|p9[59]|tail latency|low[-\s]?latency|distributed systems?|memory management|concurrency|kubernetes|terraform)\b/i;
const DUTY_LEAD = /^(?:(?:you(?:'ll| will)?|personally)\s+)?(?:own|provision|operate|manage|maintain|administer|build|design|optimize)\b/i;
const NON_REQUIRED_OR_OTHER_OWNER = /\b(?:not|no|never|optional|nice[-\s]?to[-\s]?haves?|a plus|a bonus|preferred|another team|other teams?|platform team|infrastructure team)\b/i;

export function systemsDomainPenalty(title: string, description?: string): 0 | 3 | 6 {
  // Company/location/prior reasons are not specialist evidence. Title only
  // retains the existing specialist threshold; backend direction is separate.
  // Known optional/negated/other-team clauses do not contribute buckets.
  let optionalSection = false;
  const sentences = (description ?? "").split(/[.!?\n]+/).filter((part) => {
    const sentence = part.replace(/^[\s*#>\-\d)]+/, "").trim();
    if (/^(?:nice[-\s]?to[-\s]?haves?|optional|bonus|preferred qualifications)\s*:?$/i.test(sentence)) optionalSection = true;
    if (/^(?:responsibilities|requirements|required qualifications|what you.ll (?:do|be responsible for))\s*:?$/i.test(sentence)) optionalSection = false;
    if (optionalSection || NON_REQUIRED_OR_OTHER_OWNER.test(sentence)) return false;
    return true;
  }).map(part => part.replace(/^[\s*#>\-\d)]+/, "").trim());
  const explicit = sentences.some(sentence => {
    const candidateExpertise = /^(?:(?:you\s+)?(?:must\s+)?(?:have|bring|demonstrate)\s+)?(?:deep|expert[-\s]?level)\b/i.test(sentence);
    return (candidateExpertise && DEEP_SPECIALIZATION.test(sentence)) ||
      (DUTY_LEAD.test(sentence) && (OWNED_INFRA.test(sentence) || PERFORMANCE_WORK.test(sentence)));
  });
  const evidence = sentences.join(" ");
  const burden = SPECIALIST_BUCKETS.reduce((count, pattern) => count + Number(pattern.test(evidence)), 0);
  const productFacing = PRODUCT_FACING_WORK.test([title, description].join(" "));
  if (explicit || (INFRA_BACKEND_TITLE.test(title) && burden >= 2) || (burden >= 4 && !productFacing)) return 6;
  return burden >= 3 ? 3 : 0;
}

export const BACKEND_DIRECTION_TITLE = /\bback[-\s]?end\b/i;
