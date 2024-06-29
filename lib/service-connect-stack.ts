import * as cdk from "aws-cdk-lib";
import { CfnOutput, Duration, RemovalPolicy } from "aws-cdk-lib";
import { Vpc } from "aws-cdk-lib/aws-ec2";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Repository } from "aws-cdk-lib/aws-ecr";
import { Cluster } from "aws-cdk-lib/aws-ecs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import {
  ManagedPolicy,
  PolicyDocument,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import { LogGroup } from "aws-cdk-lib/aws-logs";
import * as ssm from "aws-cdk-lib/aws-ssm";
import type { Construct } from "constructs";

export class ServiceConnectStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // VPC
    const vpc = new Vpc(this, "Vpc", { maxAzs: 2 });
    const subnetIdList = vpc.privateSubnets.map((obj) => obj.subnetId);

    // 外部用：Clientコンテナ用のセキュリティグループ
    const clientContainerSg = new ec2.SecurityGroup(this, "ClientContainerSg", {
      vpc,
    });

    // 内部用：Internalコンテナ用のセキュリティグループ
    const internalContainerSg = new ec2.SecurityGroup(
      this,
      "InternalContainerSg",
      { vpc },
    );
    // Clientコンテナからの接続は許可
    clientContainerSg.connections.allowTo(
      internalContainerSg,
      ec2.Port.tcp(80),
    );

    // ECSクラスタ
    new Cluster(this, "EcsCluster", {
      vpc,
      clusterName: "ServiceConnect",
      // Service Connectを使うためには名前空間の設定が必要
      defaultCloudMapNamespace: {
        name: "ServiceConnectNS",
      },
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
                // ecs execで必要
                "ssmmessages:CreateControlChannel",
                "ssmmessages:CreateDataChannel",
                "ssmmessages:OpenControlChannel",
                "ssmmessages:OpenDataChannel",
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
    });

    // ロググループ
    const logGroup = new LogGroup(this, "logGroup", {});
    const serviceConnectLogGroup = new LogGroup(
      this,
      "ServiceConnectLogGroup",
      {},
    );

    // タスク実行ロールに権限付与
    logGroup.grantWrite(taskExecRole);
    serviceConnectLogGroup.grantWrite(taskExecRole);

    // SSMパラメータの設定(ecspressoから参照する)
    new ssm.StringParameter(this, "TaskRoleParam", {
      parameterName: "/ecs/service-connect-cdk/task-role",
      stringValue: taskRole.roleArn,
    });
    new ssm.StringParameter(this, "TaskExecRoleParam", {
      parameterName: "/ecs/service-connect-cdk/task-exec-role",
      stringValue: taskExecRole.roleArn,
    });
    for (let i = 0; i < subnetIdList.length; i++) {
      new ssm.StringParameter(this, `ContainerSubnetParam${i}`, {
        parameterName: `/ecs/service-connect-cdk/subnet-id-${i}`,
        stringValue: subnetIdList[i],
      });
    }
    new ssm.StringParameter(this, "ClientContainerSgParam", {
      parameterName: "/ecs/service-connect-cdk/client-sg-id",
      stringValue: clientContainerSg.securityGroupId,
    });
    new ssm.StringParameter(this, "InternalContainerSgParam", {
      parameterName: "/ecs/service-connect-cdk/internal-sg-id",
      stringValue: internalContainerSg.securityGroupId,
    });
    new ssm.StringParameter(this, "LogGroupParam", {
      parameterName: "/ecs/service-connect-cdk/log-group-name",
      stringValue: logGroup.logGroupName,
    });
    new ssm.StringParameter(this, "ServiceConnectLogGroupParam", {
      parameterName: "/ecs/service-connect-cdk/service-connect-log-group-name",
      stringValue: serviceConnectLogGroup.logGroupName,
    });
  }
}
