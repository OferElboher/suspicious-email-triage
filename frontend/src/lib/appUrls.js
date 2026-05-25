/** Django admin UI for user CRUD (admin role only). */
export function djangoAdminUrl() {
  return process.env.REACT_APP_DJANGO_ADMIN_URL || "http://localhost:8000/admin/";
}
