'use strict';

const sinon = require('sinon');
const BbPromise = require('bluebird');
const path = require('path');
const expect = require('chai').expect;
const AwsProvider = require('../../provider/awsProvider');
const Serverless = require('../../../../Serverless');
const validate = require('../../lib/validate');
const configureStack = require('../lib/configureStack');

describe('#configureStack', () => {
  let serverless;
  const awsPlugin = {};
  const functionName = 'test';

  beforeEach(() => {
    serverless = new Serverless();
    awsPlugin.serverless = serverless;
    awsPlugin.provider = new AwsProvider(serverless);
    awsPlugin.options = {
      stage: 'dev',
      region: 'us-east-1',
    };

    Object.assign(awsPlugin, configureStack, validate);

    awsPlugin.serverless.cli = new serverless.classes.CLI();

    awsPlugin.serverless.service.provider.compiledCloudFormationTemplate = {
      Resources: {},
      Outputs: {},
    };
    awsPlugin.serverless.service.service = 'new-service';
    awsPlugin.serverless.service.functions = {
      [functionName]: {
        name: 'test',
        artifact: 'test.zip',
        handler: 'handler.hello',
      },
    };
  });

  it('should validate the region for the given S3 bucket', () => {
    const bucketName = 'com.serverless.deploys';

    const getBucketLocationStub = sinon
      .stub(awsPlugin.provider, 'request').returns(
        BbPromise.resolve({ LocationConstraint: awsPlugin.options.region })
      );

    awsPlugin.serverless.service.provider.deploymentBucket = bucketName;
    return awsPlugin.configureStack()
      .then(() => {
        expect(getBucketLocationStub.args[0][0]).to.equal('S3');
        expect(getBucketLocationStub.args[0][1]).to.equal('getBucketLocation');
        expect(getBucketLocationStub.args[0][2].Bucket).to.equal(bucketName);
      });
  });

  it('should reject an S3 bucket in the wrong region', () => {
    const bucketName = 'com.serverless.deploys';

    const createStackStub = sinon
      .stub(awsPlugin.provider, 'request').returns(
        BbPromise.resolve({ LocationConstraint: 'us-west-1' })
      );

    awsPlugin.serverless.service.provider.deploymentBucket = 'com.serverless.deploys';
    return awsPlugin.configureStack()
      .catch((err) => {
        expect(createStackStub.args[0][0]).to.equal('S3');
        expect(createStackStub.args[0][1]).to.equal('getBucketLocation');
        expect(createStackStub.args[0][2].Bucket).to.equal(bucketName);
        expect(err.message).to.contain('not in the same region');
      })
      .then(() => {});
  });


  it('should merge the IamRoleLambdaExecution template into the CloudFormation template', () => {
    const IamRoleLambdaExecutionTemplate = awsSdk.serverless.utils.readFileSync(
      path.join(
        __dirname,
        '..',
        'lib',
        'iam-role-lambda-execution-template.json'
      )
    );

    return awsSdk.configureStack()
      .then(() => {
        expect(awsSdk.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.IamRoleLambdaExecution
        ).to.deep.equal(IamRoleLambdaExecutionTemplate.IamRoleLambdaExecution);
      });
  });

  it('should add custom IAM policy statements', () => {
    awsSdk.serverless.service.provider.name = 'aws';
    awsSdk.serverless.service.provider.iamRoleStatements = [
      {
        Effect: 'Allow',
        Action: [
          'something:SomethingElse',
        ],
        Resource: 'some:aws:arn:xxx:*:*',
      },
    ];


    return awsSdk.configureStack()
      .then(() => {
        console.log(JSON.stringify(awsSdk.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.IamRoleLambdaExecution.Properties.Policies));
        expect(awsSdk.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.IamRoleLambdaExecution.Properties.Policies[0].PolicyDocument.Statement[1]
        ).to.deep.equal(awsSdk.serverless.service.provider.iamRoleStatements[0]);
      });
  });

  it('should use a custom bucket if specified', () => {
    const bucketName = 'com.serverless.deploys';

    awsPlugin.serverless.service.provider.deploymentBucket = bucketName;

    const coreCloudFormationTemplate = awsPlugin.serverless.utils.readFileSync(
      path.join(
        __dirname,
        '..',
        'lib',
        'core-cloudformation-template.json'
      )
    );
    awsPlugin.serverless.service.provider
      .compiledCloudFormationTemplate = coreCloudFormationTemplate;

    sinon
      .stub(awsPlugin.provider, 'request')
      .returns(BbPromise.resolve({ LocationConstraint: '' }));

    return awsPlugin.configureStack()
      .then(() => {
        expect(
          awsPlugin.serverless.service.provider.compiledCloudFormationTemplate
            .Outputs.ServerlessDeploymentBucketName.Value
        ).to.equal(bucketName);
        // eslint-disable-next-line no-unused-expressions
        expect(
          awsPlugin.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.ServerlessDeploymentBucket
        ).to.not.exist;
      });
  });
  });
