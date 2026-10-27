/** Repository-owned required CI policy, supplied only by GitHub stubs in gauntlet fixtures. */
export function gauntletPolicy(url: string): Response | undefined {
  if (url.includes("/protection/required_status_checks")) return Response.json({ checks: [{ context: "CI", app_id: 15368 }] });
  if (url.includes("/rules/branches/")) return Response.json([]);
}
