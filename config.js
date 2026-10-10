/* Deployment config for the control panel.
 *
 * API_BASE — the URL of the calling backend.
 *
 *   • If the panel is served by Netlify, leave this EMPTY ("") and it will use
 *     this site's own /api.
 *   • If the panel is served by GitHub Pages (or anywhere without its own API),
 *     set it to the backend's URL, e.g. "https://own-custom-calling-agent.onrender.com".
 *
 * A value typed into the gear/settings box on the site always overrides this.
 */
window.AGENT_CONFIG = {
  API_BASE: "https://owncustomvoicecallingagent.netlify.app",
};
