import { describe, expect, test } from "bun:test";
import { applyPreferenceSignals } from "../convex/jobPreferenceScore";

const baseJob = {
  _id: "candidate",
  title: "Product Engineer, AI Tools",
  company: "GoodCo",
  source: "company_board",
  location: "Seattle, WA",
  remoteStatus: "remote",
  fitScore: 10,
  fitReasons: ["target role", "target domain"],
};

describe("job preference scoring", () => {
  test("boosts jobs similar to saved and applied listings", () => {
    const [scored] = applyPreferenceSignals(
      [baseJob],
      [
        {
          status: "saved",
          job: { ...baseJob, _id: "saved-1", title: "Product Engineer, AI Developer Tools", fitScore: 8 },
        },
        {
          status: "applied",
          job: { ...baseJob, _id: "applied-1", title: "Full Stack Engineer, AI Tools", fitScore: 9 },
        },
      ],
    );

    expect(scored.preferenceScore).toBeGreaterThan(0);
    expect(scored.personalizedScore).toBeGreaterThan(baseJob.fitScore);
    expect(scored.preferenceReasons).toContain("similar to saved/applied roles");
  });

  test("penalizes jobs similar to archived listings", () => {
    const [scored] = applyPreferenceSignals(
      [{ ...baseJob, title: "Principal Mobile Engineer", fitScore: 15, fitReasons: [] }],
      [
        {
          status: "archived",
          job: { ...baseJob, _id: "archived-1", title: "Senior Mobile Engineer", fitScore: 12, fitReasons: [] },
        },
      ],
    );

    expect(scored.preferenceScore).toBeLessThan(0);
    expect(scored.personalizedScore).toBeLessThan(15);
    expect(scored.preferenceReasons).toContain("similar to archived roles");
  });

  test("strongly downranks backend/infrastructure and embedded-heavy domains", () => {
    const scored = applyPreferenceSignals(
      [
        {
          ...baseJob,
          _id: "inference",
          title: "Staff + Senior Software Engineer, Inference",
          fitScore: 16,
          description:
            "Build distributed systems for model serving, request routing, load balancing, Kubernetes, autoscaling, accelerators, and multi-region inference infrastructure.",
        },
        {
          ...baseJob,
          _id: "product",
          title: "Senior Product Engineer",
          fitScore: 14,
          description: "Build user-facing AI workflow products with React, TypeScript, Next.js, SDKs, and developer experience polish.",
        },
        {
          ...baseJob,
          _id: "connectivity",
          title: "Connectivity Software Engineer, Consumer Devices",
          fitScore: 13,
          description: "Own Bluetooth, BLE, Wi-Fi, wireless connectivity, embedded device networking, and hardware integration.",
        },
        {
          ...baseJob,
          _id: "cdn",
          title: "Sr. Software Engineer, CDN (Starlink)",
          fitScore: 14,
          description:
            "Build CDN, content delivery, edge networking, packet routing, global traffic management, and low-latency distributed systems for Starlink.",
        },
      ],
      [],
    );

    const inference = scored.find((job) => job._id === "inference")!;
    const product = scored.find((job) => job._id === "product")!;
    const connectivity = scored.find((job) => job._id === "connectivity")!;
    const cdn = scored.find((job) => job._id === "cdn")!;

    expect(inference.personalizedScore).toBeLessThan(product.personalizedScore);
    expect(inference.preferenceReasons).toContain("backend/infrastructure specialist domain");
    expect(connectivity.preferenceReasons).toContain("embedded/hardware specialist domain");
    expect(cdn.personalizedScore).toBeLessThan(product.personalizedScore);
    expect(cdn.preferenceReasons).toContain("backend/infrastructure specialist domain");
  });

  test("caps accumulated preference signals so history cannot overwhelm fit score", () => {
    const scored = applyPreferenceSignals(
      [baseJob],
      Array.from({ length: 20 }, (_, index) => ({
        status: "archived" as const,
        job: { ...baseJob, _id: `archived-${index}`, title: "Product Engineer, AI Tools", fitScore: 10 },
      })),
    );

    expect(scored[0].preferenceScore).toBeGreaterThanOrEqual(-6);
  });
});
