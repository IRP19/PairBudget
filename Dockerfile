FROM nginx:alpine 

COPY index.html app.js styles.css household-data.js /usr/share/nginx/html/
COPY nginx.conf /etc/nginx/conf.d/default.conf

