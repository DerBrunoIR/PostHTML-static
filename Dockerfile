FROM nginx:alpine

# Purge default configuration to prevent routing conflicts
RUN rm /etc/nginx/conf.d/default.conf

# Inject custom routing logic
COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY ./dist /www

EXPOSE 80
