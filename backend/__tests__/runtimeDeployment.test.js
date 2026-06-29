const {
  deploymentEnv,
  isDevDeployment,
  isStagingDeployment,
  isProdDeployment,
  usesMockExternalServices,
} = require("../src/config/runtime");

describe("runtime deployment slice helpers", () => {
  const prevDeployment = process.env.DEPLOYMENT_ENV;
  const prevApp = process.env.APP_ENV;

  afterEach(() => {
    if (prevDeployment === undefined) {
      delete process.env.DEPLOYMENT_ENV;
    } else {
      process.env.DEPLOYMENT_ENV = prevDeployment;
    }
    if (prevApp === undefined) {
      delete process.env.APP_ENV;
    } else {
      process.env.APP_ENV = prevApp;
    }
  });

  it("isDevDeployment is true only for dev slice", () => {
    process.env.DEPLOYMENT_ENV = "dev";
    expect(isDevDeployment()).toBe(true);
    expect(usesMockExternalServices()).toBe(true);
    process.env.DEPLOYMENT_ENV = "staging";
    expect(isDevDeployment()).toBe(false);
    expect(usesMockExternalServices()).toBe(false);
  });

  it("isStagingDeployment and isProdDeployment identify non-dev slices", () => {
    process.env.DEPLOYMENT_ENV = "staging";
    expect(isStagingDeployment()).toBe(true);
    expect(isProdDeployment()).toBe(false);
    process.env.DEPLOYMENT_ENV = "prod";
    expect(isProdDeployment()).toBe(true);
    expect(isStagingDeployment()).toBe(false);
  });

  it("deploymentEnv normalizes APP_ENV alias", () => {
    delete process.env.DEPLOYMENT_ENV;
    process.env.APP_ENV = "PROD";
    expect(deploymentEnv()).toBe("prod");
  });
});
