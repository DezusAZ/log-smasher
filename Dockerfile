# Self-contained image: static site baked in, no host bind mounts.
# This is deliberate — CasaOS "uninstall" deletes an app's bind-mount source
# tree, so bind-mounting /DATA/projects/log-smasher would let an uninstall wipe
# the project. Baking the files into the image keeps the source safe.
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY static/ /usr/share/nginx/html/
EXPOSE 8810
