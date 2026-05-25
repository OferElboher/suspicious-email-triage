/** Permission codes referenced by middleware and the admin UI. */
const PERMISSIONS = [
  { code: "reviews.read", description: "List and read review documents" },
  { code: "reviews.write", description: "Create new review submissions" },
  { code: "reviews.override", description: "Save analyst overrides on completed reviews" },
  { code: "metrics.read", description: "Read analytics and chart metrics" },
  { code: "dev.simulation", description: "Use dev simulation controls" },
  { code: "dev.reset", description: "Reset local dev databases and queues" },
  { code: "admin.users", description: "Provision and manage user accounts" },
  { code: "logs.read", description: "Search merged application logs" },
];

/** Default role → permission mapping seeded on first startup. */
const ROLE_PERMISSIONS = {
  admin: PERMISSIONS.map((p) => p.code),
  analyst: ["reviews.read", "reviews.write", "reviews.override"],
  manager: ["reviews.read", "metrics.read"],
  developer: [
    "reviews.read",
    "reviews.write",
    "reviews.override",
    "dev.simulation",
    "dev.reset",
  ],
  viewer: ["reviews.read"],
};

const ROLE_NAMES = Object.keys(ROLE_PERMISSIONS);

module.exports = { PERMISSIONS, ROLE_PERMISSIONS, ROLE_NAMES };
