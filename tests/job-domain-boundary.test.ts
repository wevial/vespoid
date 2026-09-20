import { describe, expect, test } from "bun:test";
import { classifyJobFit } from "../src/lib/job-fit";
import { applyPreferenceSignals } from "../convex/jobPreferenceScore";
import reviewedRoles from "./fixtures/reviewed-role-evidence.json";
import { createHash } from "node:crypto";

const base = { company: "ExampleCo", location: "Remote US", remoteStatus: "remote", salaryRange: "$190k - $230k" };
function check(title: string, description: string) {
  const job = { ...base, title, description };
  const fit = classifyJobFit(job);
  const [rank] = applyPreferenceSignals([{ ...job, _id: "fixture", fitScore: fit.score, fitReasons: fit.reasons }], []);
  return { fit, rank };
}

describe("narrow specialist-boundary correction", () => {
  test("retains archived scale concern and transferable distributed-performance contrasts", () => {
    const sentry = reviewedRoles.find(r => r.company === "Sentry")!;
    // Exact archived replay, plus a company/title-independent paraphrase of the
    // distributed systems + latency + consistency requirements, not a volume regex.
    for (const [title, description] of [
      [sentry.title, sentry.text],
      ["Senior Platform Engineer", "Python services. Distributed systems expertise for event processing with low latency and data consistency across regions."],
    ]) {
      const { fit, rank } = check(title, description);
      expect(fit.rejectionReasons).toContain("backend/infrastructure specialist role");
      expect(rank.preferenceScore).toBe(-6);
    }
    expect(check("Senior Software Engineer", "Python. Distributed systems expertise for event processing with low latency and data consistency.").rank.preferenceScore).toBe(-3);
    // Ordinary usage billing and a big customer count alone are not specialization.
    for (const description of [
      "Build Python billing APIs, database integration and application CI/CD for millions of customers.",
      "Build Python billing APIs. Another team owns distributed systems, low latency and data consistency.",
      "Build Python billing APIs. No distributed systems, low latency or data consistency responsibilities.",
      "Build Python billing APIs. NICE-TO-HAVES\nDistributed systems, low latency and data consistency.",
    ]) expect(check("Senior Product Engineer", description).rank.preferenceScore).toBe(0);
  });

  test("preserves established specialist buckets without requiring imperative ownership wording", () => {
    for (const [title, description] of [
      ["Senior CDN Engineer", "Python. Experience with CDN, global traffic, low latency and distributed systems."],
      ["Senior Inference Engineer", "Python. Experience with model serving, GPU, multi-region distributed systems."],
      ["Senior Database Engineer", "Python. Experience with storage backends, failover and distributed systems."],
      ["Senior Platform Engineer", "Python. Experience with SRE incident response and cloud infrastructure orchestration."],
    ]) {
      const { fit, rank } = check(title, description);
      expect(fit.rejectionReasons).toContain("backend/infrastructure specialist role");
      expect(rank.preferenceScore).toBe(-6);
    }
  });
});

describe("application backend is not infrastructure expertise", () => {
  test("replays exact public Render/Read AI evidence without manufacturing eligibility or personal decisions", () => {
    expect(reviewedRoles).toHaveLength(5);
    for (const role of reviewedRoles) {
      expect(createHash("sha256").update(role.text).digest("hex")).toBe(role.textSha256);
      if (role.company === "Supabase" || role.title.includes("Backend")) {
        const job = { title: role.title, company: role.company, description: role.text };
        const fit = classifyJobFit(job);
        const [rank] = applyPreferenceSignals([{ ...job, _id: role.id, fitScore: fit.score }], []);
        expect(rank.preferenceScore).toBe(role.company === "Supabase" ? -6 : -2);
        expect(fit.rejectionReasons.includes("backend/infrastructure specialist role")).toBe(role.company === "Supabase");
      }
    }
    for (const role of reviewedRoles.filter(r => r.company === "Render" || r.title.endsWith("Fullstack"))) {
      const job = { title: role.title, company: role.company, description: role.text };
      const fit = classifyJobFit(job);
      const [rank] = applyPreferenceSignals([{ ...job, _id: role.id, fitScore: fit.score }], []);
      expect(fit.rejectionReasons).not.toContain("backend/infrastructure specialist role");
      expect(fit.reasons).not.toContain("backend/infrastructure-heavy role");
      expect(rank.preferenceScore).toBe(0);
      // No isRelevant/eligibility assertion: Fullstack is still user-undecided.
    }
  });
  test("keeps substantial application backend, ordinary delivery, and non-owned infrastructure", () => {
    const descriptions = [
      "Build Go and Python application APIs, business logic, and database integration.",
      "Build user-facing Go and Python application APIs and database-backed microservices. Services run on Kubernetes managed by another team.",
      "Build Go and Python application APIs and database-backed microservices. Kubernetes infrastructure is managed by another team.",
      "Build Go APIs with database integration. No Kubernetes or on-call responsibilities.",
      "Build Go APIs with database integration and regular application on-call. Maintain application CI/CD workflows and troubleshoot deployments.",
      "Build Go APIs with database integration. Experience operating Kubernetes clusters is a plus.",
      "Build Go APIs with database integration. Our platform team owns provisioning and operation of Kubernetes clusters.",
      "Build Go APIs with database integration. You do not operate Kubernetes clusters.",
      "Build Go APIs with database integration. Our company has deep expertise in Kubernetes and tail latency.",
      "Build Go APIs with database integration. Nice to have:\n- Deep expertise in Kubernetes.\n- Operate Kubernetes clusters.",
      "Build Go APIs that run on Kubernetes clusters with database integration.",
      "Build Go APIs with database integration. NICE-TO-HAVES\nDeep expertise in Kubernetes.",
      "Build Go APIs with database integration. Deep expertise in Kubernetes is a bonus.",
    ];
    for (const title of ["Senior Product Engineer", "Senior Backend Engineer", "Senior Back-End Engineer", "Senior Software Engineer", "Senior Full Stack Engineer"]) {
      for (const description of descriptions) {
        const { fit, rank } = check(title, description);
        expect(fit.isRelevant).toBe(true);
        expect(fit.rejectionReasons).not.toContain("backend/infrastructure specialist role");
        expect(fit.reasons).not.toContain("backend/infrastructure-heavy role");
        expect(rank.preferenceReasons).not.toContain("backend/infrastructure specialist domain");
        expect(rank.preferenceScore).toBe(/back[-\s]?end/i.test(title) ? -2 : 0);
      }
    }
  });

  test("preserves explicit owned infra and specialist performance penalties even under generic titles", () => {
    for (const description of [
      "Own provisioning and operation of Kubernetes clusters and Terraform infrastructure. Build Go services; own incident response.",
      "Build Go APIs. Personally provision and operate Kubernetes clusters with Terraform; own SRE and incident response.",
      "Design distributed systems with high-QPS request routing and tail latency optimization. Build Go APIs.",
      "Build Go APIs. Deep specialization in high-QPS, p99, tail latency, low latency and load balancing.",
      "Build distributed systems for model serving, request routing, load balancing, autoscaling, Kubernetes, accelerators, and multi-region inference infrastructure.",
      "Build CDN, content delivery, edge networking, packet routing, global traffic management, and low-latency distributed systems. Build Go services.",
    ]) {
      const { fit, rank } = check("Senior Software Engineer", description);
      expect(fit.rejectionReasons).toContain("backend/infrastructure specialist role");
      expect(fit.isRelevant).toBe(false);
      expect(rank.preferenceReasons).toContain("backend/infrastructure specialist domain");
      expect(rank.preferenceScore).toBe(-6);
    }
  });

  test("backend downranking is an explicit career preference; unrelated metadata is not expertise", () => {
    const description = "Build Go and Python application APIs with databases and microservices.";
    const backend = check("Senior Backend Engineer", description);
    expect(backend.rank.preferenceReasons).toContain("backend title: career-direction preference (not capability)");
    const [rank] = applyPreferenceSignals([{ ...base, _id: "metadata", title: "Senior Product Engineer", description,
      company: "Kubernetes Infrastructure Database", fitScore: 12,
      fitReasons: ["Own provisioning and operation of Kubernetes clusters; deep specialization in tail latency"] }], []);
    expect(rank.preferenceScore).toBe(0);
  });
});
