import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {Vpc} from "aws-cdk-lib/aws-ec2";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import {CfnOutput, Duration, RemovalPolicy} from "aws-cdk-lib";
import {Cluster} from "aws-cdk-lib/aws-ecs";
import {ManagedPolicy, PolicyDocument, Role, ServicePrincipal} from "aws-cdk-lib/aws-iam";
import {LogGroup} from "aws-cdk-lib/aws-logs";
import {Repository} from "aws-cdk-lib/aws-ecr";
import * as ssm from "aws-cdk-lib/aws-ssm";

export class CdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // VPC
    const vpc = new Vpc(this, "Vpc", { maxAzs: 2 });
    const subnetIdList = vpc.privateSubnets.map((obj) => obj.subnetId);

    // セキュリティグループ
    const albSg = new ec2.SecurityGroup(this, "AlbSg", {
      vpc,
      allowAllOutbound: true,
    });
    albSg.addIngressRule(ec2.Peer.ipv4("0.0.0.0/0"), ec2.Port.tcp(80));

    // Appコンテナ用のセキュリティグループ
    const containerSg = new ec2.SecurityGroup(this, "ContainerSg", { vpc });
    albSg.connections.allowTo(containerSg, ec2.Port.tcp(3000)); // ALBからの接続は許可

    // InternalAppコンテナ用のセキュリティグループ
    const internalContainerSg = new ec2.SecurityGroup(this, "InternalContainerSg", { vpc });
    albSg.connections.allowTo(internalContainerSg, ec2.Port.tcp(3000)); // ALBからの接続は許可
    containerSg.connections.allowTo(internalContainerSg, ec2.Port.tcp(3000)); // Appコンテナからの接続は許可

    // ALB
    const alb = new elbv2.ApplicationLoadBalancer(this, "Alb", {
      vpc,
      internetFacing: true,
      securityGroup: albSg,
    });
    const internalAlb = new elbv2.ApplicationLoadBalancer(this, "InternalAlb", {
      vpc,
      internetFacing: false,
      securityGroup: albSg,
    });

    // ターゲットグループ
    const containerTg = new elbv2.ApplicationTargetGroup(this, "ContainerTg", {
      targetType: elbv2.TargetType.IP,
      port: 3000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      // ヘルスチェックをカスタマイズする
      healthCheck: {
        path: "/api",
        healthyHttpCodes: "200",
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 2,
        interval: Duration.seconds(5),
        timeout: Duration.seconds(3),
      },
      deregistrationDelay: Duration.seconds(5),
      vpc,
    });
    const internalContainerTg = new elbv2.ApplicationTargetGroup(this, "InternalContainerTg", {
      targetType: elbv2.TargetType.IP,
      port: 3000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      // ヘルスチェックをカスタマイズする
      healthCheck: {
        path: "/api",
        healthyHttpCodes: "200",
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 2,
        interval: Duration.seconds(5),
        timeout: Duration.seconds(3),
      },
      deregistrationDelay: Duration.seconds(5),
      vpc,
    });

    // ALBリスナー
    alb.addListener("Listener-HTTPS", {
      defaultTargetGroups: [containerTg],
      open: true,
      port: 80,
    });
    new CfnOutput(this, "ALBLoadBalancerDnsName", {
      value: alb.loadBalancerDnsName,
    });

    internalAlb.addListener("InternalListener-HTTPS", {
      defaultTargetGroups: [internalContainerTg],
      open: true,
      port: 80,
    });
    new CfnOutput(this, "InternalALBLoadBalancerDnsName", {
      value: internalAlb.loadBalancerDnsName,
    });

    // ECSクラスタ
    new Cluster(this, "EcsCluster", {
      vpc,
      clusterName: "NextJsCluster",
      defaultCloudMapNamespace: {
        name: "NextJsSandbox",
      }
    });

    // タスクロール
    const taskRole = new Role(this, "TaskRole", {
      assumedBy: new ServicePrincipal("ecs-tasks.amazonaws.com"),
      inlinePolicies: {
        inlinePolicies: PolicyDocument.fromJson({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: [
                "logs:CreateLogStream",
                "logs:CreateLogGroup",
                "logs:DescribeLogStreams",
                "logs:PutLogEvents",
                "ssmmessages:CreateControlChannel",
                "ssmmessages:CreateDataChannel",
                "ssmmessages:OpenControlChannel",
                "ssmmessages:OpenDataChannel"
              ],
              Resource: ["*"],
            },
          ],
        }),
      },
    });

    // タスク実行ロール
    const taskExecRole = new Role(this, "TaskExecRole", {
      assumedBy: new ServicePrincipal("ecs-tasks.amazonaws.com"),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName(
          "AmazonEC2ContainerRegistryReadOnly",
        ),
      ],
      inlinePolicies: {
        inlinePolicies: PolicyDocument.fromJson({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: [
                "secretsmanager:GetSecretValue",
                "logs:CreateLogStream",
                "logs:CreateLogGroup",
                "logs:DescribeLogStreams",
                "logs:PutLogEvents",
              ],
              Resource: ["*"],
            },
          ],
        }),
      },
    });

    // ロググループ
    const logGroup = new LogGroup(this, "logGroup", {});

    // ECR
    const repository = new Repository(this, "Repository", {
      removalPolicy: RemovalPolicy.DESTROY,
      emptyOnDelete: true,
    });
    new CfnOutput(this, "RepositoryURI", {
      value: repository.repositoryUri,
    });

    // タスク実行ロールに権限付与
    repository.grantPull(taskExecRole);
    logGroup.grantWrite(taskExecRole);

    // SSMパラメータの設定(ecspressoから参照する)
    new ssm.StringParameter(this, "TaskRoleParam", {
      parameterName: "/ecs/next-js-cdk/task-role",
      stringValue: taskRole.roleArn,
    });
    new ssm.StringParameter(this, "TaskExecRoleParam", {
      parameterName: "/ecs/next-js-cdk/task-exec-role",
      stringValue: taskExecRole.roleArn,
    });
    for (let i = 0; i < subnetIdList.length; i++) {
      new ssm.StringParameter(this, `ContainerSubnetParam${i}`, {
        parameterName: `/ecs/next-js-cdk/subnet-id-${i}`,
        stringValue: subnetIdList[i],
      });
    }
    new ssm.StringParameter(this, "ContainerSgParam", {
      parameterName: "/ecs/next-js-cdk/sg-id",
      stringValue: containerSg.securityGroupId,
    });
    new ssm.StringParameter(this, "InternalContainerSgParam", {
      parameterName: "/ecs/next-js-cdk/internal-sg-id",
      stringValue: internalContainerSg.securityGroupId,
    });
    new ssm.StringParameter(this, "ContainerTgParam", {
      parameterName: "/ecs/next-js-cdk/tg-arn",
      stringValue: containerTg.targetGroupArn,
    });
    new ssm.StringParameter(this, "InternalContainerTgParam", {
      parameterName: "/ecs/next-js-cdk/internal-tg-arn",
      stringValue: internalContainerTg.targetGroupArn,
    });
    new ssm.StringParameter(this, "LogGroupParam", {
      parameterName: "/ecs/next-js-cdk/log-group-name",
      stringValue: logGroup.logGroupName,
    });
    new ssm.StringParameter(this, "EcrRepositoryName", {
      parameterName: "/ecs/next-js-cdk/ecr-repository-name",
      stringValue: repository.repositoryUri,
    });
  }
}
