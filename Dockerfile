FROM nginx:alpine

# Purge default configuration to prevent routing conflicts
RUN rm /etc/nginx/conf.d/default.conf

# Inject custom routing logic
COPY nginx.conf /etc/nginx/conf.d/default.conf

RUN mkdir /www

EXPOSE 80
