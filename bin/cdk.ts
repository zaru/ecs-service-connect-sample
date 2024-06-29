#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { ServiceConnectStack } from "../lib/service-connect-stack";

const app = new cdk.App();
new ServiceConnectStack(app, "ServiceConnectStack", {});
