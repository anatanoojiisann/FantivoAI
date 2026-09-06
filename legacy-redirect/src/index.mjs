export default {
  async fetch(request, env) {
    const targetOrigin = new URL(env.TARGET_ORIGIN);
    const destination = new URL(request.url);
    destination.protocol = targetOrigin.protocol;
    destination.host = targetOrigin.host;
    return Response.redirect(destination.toString(), 308);
  },
};
