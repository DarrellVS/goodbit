call npm run build
docker build --platform linux/arm64/v8 -t darrellvs/filmpje:arm64 .
docker push darrellvs/filmpje:arm64
