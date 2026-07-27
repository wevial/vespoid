import { expect, test } from "bun:test";

test("job cards are loaded through the Convex action transport", async () => {
  const source = await Bun.file(new URL("../src/app/jobs/page.tsx", import.meta.url)).text();

  expect(source).toContain("convexHttp.action(api.jobs.listJobCards");
  expect(source).not.toContain("convexHttp.query(api.jobs.listJobCards");
});

test("quick actions do not mutate pages loaded by a later filter generation", async () => {
  const source = await Bun.file(new URL("../src/app/jobs/page.tsx", import.meta.url)).text();

  expect(source).toContain("const mutationGeneration = requestGeneration.current;");
  expect(source).toContain("if (!isCurrentRequestGeneration(mutationGeneration, requestGeneration.current)) return;");
});

test("salary renders in a dedicated job-list column rather than the role cell", async () => {
  const source = await Bun.file(new URL("../src/app/jobs/page.tsx", import.meta.url)).text();
  const roleStart = source.indexOf('className="md:col-span-3">');
  const roleEnd = source.indexOf("</Link>", roleStart);
  const roleCell = roleStart >= 0 && roleEnd > roleStart ? source.slice(roleStart, roleEnd) : undefined;

  expect(source).toContain('<span className="col-span-2">Salary</span>');
  expect(source).toContain('<span className="text-orange-100/88 md:col-span-2"><span className="md:hidden text-blue-50/45">Salary: </span>{formatSalaryPreview(job.salaryRange)}</span>');
  expect(roleCell).toBeDefined();
  expect(roleCell).not.toContain("formatSalaryPreview(job.salaryRange)");
});
