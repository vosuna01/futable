/** Paths stay inside the deployment, including GitHub project Pages. */
export const appBase = import.meta.env.BASE_URL;
export const appUrl = (file = "") => appBase + file.replace(/^\/+/, "");
