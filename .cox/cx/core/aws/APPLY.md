# Apply this stack with your own AWS credentials (plan-only from Coxswain)
aws cloudformation deploy \
  --template-file template.yaml \
  --stack-name cxos-core \
  --capabilities CAPABILITY_IAM
