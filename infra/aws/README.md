# Deploying DocLift to AWS

One CloudFormation stack ([liftdoc.yml](liftdoc.yml)) creates everything:

| Piece | What runs there |
|---|---|
| ECR | Two image repositories, `liftdoc-backend` and `liftdoc-web` |
| ECS on one EC2 instance | One task with three containers: `web` (Next.js), `backend` (FastAPI) and `db` (Postgres 16) |
| Instance disk | Two Docker volumes: the Postgres data and the uploaded/converted files |
| CloudFront | The public HTTPS address (`https://….cloudfront.net`); the instance accepts traffic from CloudFront only |
| IAM role for GitHub Actions | Lets the `Deploy` workflow push images and restart the service; signs in with OIDC, so no AWS keys are stored in GitHub |

## First-time setup

Requires the AWS CLI and GitHub CLI, both signed in. The AWS user needs permission to create
IAM roles, EC2, ECS, ECR and CloudFront resources (an administrator user is simplest).

```sh
aws configure                      # once: access key, secret key, region
infra/aws/setup.sh                 # creates the stack (about 10 minutes) and sets the GitHub variables
gh workflow run Deploy --ref main  # builds both images and starts the service
infra/aws/setup.sh                 # run again so the stack records that the service is running
```

The script prints the site address when it finishes. Options are environment variables:
`AWS_REGION` (default: your CLI region, else `us-east-1`), `INSTANCE_TYPE` (default `t3.micro`)
and `STACK_NAME` (default `liftdoc`).

## Deploys after that

Every merge to `main` that touches `apps/` runs the [Deploy workflow](../../.github/workflows/deploy.yml):
it builds both images, pushes them to ECR as `latest`, and restarts the ECS service.
There is one instance, so the site is down for roughly a minute during each deploy.

## Operating it

```sh
# Logs
aws logs tail /ecs/liftdoc --follow

# Shell on the instance (no SSH port is open)
aws ssm start-session --target "$(aws cloudformation describe-stacks --stack-name liftdoc \
  --query "Stacks[0].Outputs[?OutputKey=='InstanceId'].OutputValue" --output text)"

# Tear everything down, including the database and all files
aws cloudformation delete-stack --stack-name liftdoc
aws ssm delete-parameter --name /liftdoc/db-password
```

## Things to know

- **Cost.** A `t3.micro`, its 30 GB disk and its public IP address are covered by the AWS free tier
  only for a limited period (6 or 12 months depending on the account's age). After that the stack
  costs roughly $10–15 a month. Set an AWS Budgets alert.
- **Memory.** A `t3.micro` has 1 GB of RAM plus 2 GB of swap for all three containers. Very large
  PDFs convert slowly or may fail; use `INSTANCE_TYPE=t3.small` if that happens.
- **Data lives on one disk.** The database and files are on the instance's volume and are not
  backed up. Replacing the instance (for example by changing `InstanceType`) erases them.
- **The database password** is generated once and stored in Parameter Store. Changing the
  parameter later does not change the password inside an existing database.
- **No login.** Anyone with the address can upload files.
