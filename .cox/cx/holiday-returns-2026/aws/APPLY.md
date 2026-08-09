# Apply this stack with your own AWS credentials (plan-only from Coxswain)
aws cloudformation deploy \
  --template-file template.yaml \
  --stack-name cxos-holiday-returns-2026 \
  --capabilities CAPABILITY_IAM
