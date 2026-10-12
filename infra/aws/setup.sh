#!/usr/bin/env bash
# One-time (and re-runnable) setup of the DocLift AWS stack. See README.md in this folder.
#
#   infra/aws/setup.sh            create or update the stack
#   AWS_REGION=eu-west-1 INSTANCE_TYPE=t3.small infra/aws/setup.sh
set -euo pipefail

STACK="${STACK_NAME:-liftdoc}"
REGION="${AWS_REGION:-$(aws configure get region || true)}"
REGION="${REGION:-us-east-1}"
INSTANCE_TYPE="${INSTANCE_TYPE:-t3.micro}"
PASSWORD_PARAM="/${STACK}/db-password"
HERE="$(cd "$(dirname "$0")" && pwd)"
export AWS_REGION="$REGION" AWS_DEFAULT_REGION="$REGION"

command -v aws >/dev/null || { echo "Install the AWS CLI first: brew install awscli" >&2; exit 1; }
command -v gh >/dev/null || { echo "Install the GitHub CLI first: brew install gh" >&2; exit 1; }
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)" \
  || { echo "Not signed in to AWS. Run 'aws configure' (or 'aws login') and try again." >&2; exit 1; }
REPO="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"
echo "Account $ACCOUNT, region $REGION, stack $STACK, repository $REPO"

# Postgres password: generated once and kept in Parameter Store, never in git.
if ! aws ssm get-parameter --name "$PASSWORD_PARAM" >/dev/null 2>&1; then
  aws ssm put-parameter --name "$PASSWORD_PARAM" --type SecureString \
    --value "$(openssl rand -hex 24)" >/dev/null
  echo "Created database password in Parameter Store ($PASSWORD_PARAM)"
fi

# Only CloudFront may reach the instance; its address list has a different ID in each region.
PREFIX_LIST="$(aws ec2 describe-managed-prefix-lists \
  --filters Name=prefix-list-name,Values=com.amazonaws.global.cloudfront.origin-facing \
  --query 'PrefixLists[0].PrefixListId' --output text)"

# GitHub's OIDC provider can exist only once per account.
CREATE_OIDC=true
if aws iam get-open-id-connect-provider \
  --open-id-connect-provider-arn "arn:aws:iam::${ACCOUNT}:oidc-provider/token.actions.githubusercontent.com" \
  >/dev/null 2>&1; then
  if ! aws cloudformation describe-stack-resource --stack-name "$STACK" \
    --logical-resource-id GitHubOidcProvider >/dev/null 2>&1; then
    CREATE_OIDC=false
  fi
fi

# Newer repositories identify themselves with permanent numeric IDs; allow both forms, main only.
read -r REPO_ID OWNER_ID < <(gh api "repos/${REPO}" --jq '"\(.id) \(.owner.id)"')
OWNER="${REPO%%/*}"
NAME="${REPO##*/}"
SUBJECTS="repo:${REPO}:ref:refs/heads/main,repo:${OWNER}@${OWNER_ID}/${NAME}@${REPO_ID}:ref:refs/heads/main"

# The service can only start once images exist, so the first run creates it stopped.
if aws ecr describe-images --repository-name "${STACK}-web" --image-ids imageTag=latest >/dev/null 2>&1 \
  && aws ecr describe-images --repository-name "${STACK}-backend" --image-ids imageTag=latest >/dev/null 2>&1; then
  DESIRED=1
else
  DESIRED=0
fi

aws cloudformation deploy \
  --stack-name "$STACK" \
  --template-file "$HERE/liftdoc.yml" \
  --capabilities CAPABILITY_IAM \
  --no-fail-on-empty-changeset \
  --parameter-overrides \
    "InstanceType=$INSTANCE_TYPE" \
    "DesiredCount=$DESIRED" \
    "DbPasswordParameter=$PASSWORD_PARAM" \
    "CloudFrontPrefixListId=$PREFIX_LIST" \
    "GitHubSubjects=$SUBJECTS" \
    "CreateOidcProvider=$CREATE_OIDC"

output() {
  aws cloudformation describe-stacks --stack-name "$STACK" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}

# Not secrets: the deploy workflow reads these as repository variables.
gh variable set AWS_REGION --body "$REGION"
gh variable set AWS_ROLE_ARN --body "$(output DeployRoleArn)"
gh variable set ECR_BACKEND --body "$(output BackendRepositoryUri)"
gh variable set ECR_WEB --body "$(output WebRepositoryUri)"
gh variable set ECS_CLUSTER --body "$(output ClusterName)"
gh variable set ECS_SERVICE --body "$(output ServiceName)"

echo
echo "Stack ready. Site address: $(output Url)"
if [ "$DESIRED" = 0 ]; then
  echo "Nothing is running yet. Start the first deploy with:  gh workflow run Deploy --ref main"
fi
