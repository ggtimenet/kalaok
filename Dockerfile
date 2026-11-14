FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --chown=node:node server.js ./server.js
COPY --chown=node:node seed/ ./seed/
COPY --chown=node:node web/ ./web/
USER node
EXPOSE 8080
HEALTHCHECK --interval=20s --timeout=3s --start-period=8s --retries=3 CMD node -e "require('http').get('http://127.0.0.1:8080/healthz',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
CMD ["node","/app/server.js"]
