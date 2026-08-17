"use client";

import { Suspense } from "react";

/**
 * Route-level template. Re-mounts on every navigation (unlike layout, which
 * persists). We use it for two things:
 *
 * 1. View Transitions API crossfade between routes — when the browser
 *    supports it. This makes route switches feel like a smooth dissolve
 *    instead of a hard flash of the loading skeleton.
 * 2. A baseline fade-in for the page content so the first paint after a
 *    navigation never pops in abruptly.
 *
 * Reduced-motion users skip the animated transition (the CSS media query
 * in tokens.css zeroes transition-duration globally).
 */
export default function AppTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="animate-fade-in"
      style={{ viewTransitionName: "app-page" }}
    >
      <Suspense>{children}</Suspense>
    </div>
  );
}
