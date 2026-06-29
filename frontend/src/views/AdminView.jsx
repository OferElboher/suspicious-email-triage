/**
 * User administration gateway — Django admin for auth_users CRUD.
 *
 * Pattern: React shell + external Django admin (admin role / admin.users permission).
 * Technology: Django runserver container on port 8000; not embedded (X-Frame-Options).
 */
import HoverHelp from "../components/HoverHelp";
import { djangoAdminUrl } from "../lib/appUrls";

/** Explains Django admin access and opens it in a new browser tab. */
export default function AdminView() {
  const adminUrl = djangoAdminUrl();

  return (
    <main className="layout layout--single">
      <section className="card admin-gateway-panel">
        <HoverHelp text="Manage auth_users, roles, and passwords in Django admin — separate from the Node API.">
          <h2>User administration</h2>
        </HoverHelp>
        <p className="muted">
          User accounts and password hashes live in PostgreSQL and are managed through{" "}
          <strong>Django admin</strong>. The triage React UI does not duplicate full user CRUD —
          operators with the admin role use the linked console below.
        </p>
        <div className="actions">
          <HoverHelp text="Opens Django admin in a new tab (http://localhost:8000/admin/ in dev).">
            <a
              className="button-link primary-link"
              href={adminUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open Django admin
            </a>
          </HoverHelp>
        </div>
        <p className="muted admin-gateway-panel__hint">
          Guide: <code>docs/auth_guide_django_admin_users.md</code> in the repository.
        </p>
      </section>
    </main>
  );
}
