```bash
aws ecr get-login-password --region ap-northeast-1 | docker login --username AWS --password-stdin 778805779039.dkr.ecr.ap-northeast-1.amazonaws.com
docker build --platform linux/x86_64 -t 778805779039.dkr.ecr.ap-northeast-1.amazonaws.com/cdkstack-repository22e53bbd-skiwtezjb3tb .
docker push 778805779039.dkr.ecr.ap-northeast-1.amazonaws.com/cdkstack-repository22e53bbd-skiwtezjb3tb:latest

ecspresso verify
ecspresso deploy
```
