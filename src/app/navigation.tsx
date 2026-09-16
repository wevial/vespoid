"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function Navigation() {
  const pathname = usePathname();
  return (
    <nav className="vespoid-nav" aria-label="Main navigation">
      <Link href="/" className="vespoid-brand" aria-label="Vespoid home">
        <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
          <path d="M24 23C8 24 7 9 15 11c6 1 9 12 9 12Zm0 0c16 1 17-14 9-12-6 1-9 12-9 12Z" fill="#e0f8fa" stroke="currentColor" strokeWidth="1.5" />
          <ellipse cx="24" cy="29" rx="6" ry="10" fill="#d2efdf" stroke="currentColor" strokeWidth="1.5" />
          <path d="M19 27h10m-10 5h10m-8-13-3-5m9 5 3-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <span className="vespoid-wordmark">vespoid</span>
      </Link>
      <div className="vespoid-nav-links">
        <Link href="/" aria-current={pathname === "/" ? "page" : undefined}>Dashboard</Link>
        <Link href="/jobs" aria-current={pathname.startsWith("/jobs") ? "page" : undefined}>Jobs</Link>
      </div>
    </nav>
  );
}
