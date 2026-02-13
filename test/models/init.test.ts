import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { initModel } from "../../src/models/init";

const envKeys = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "ZEITZEUGE_MODEL"] as const;

function saveEnv(): Record<string, string | undefined> {
  const saved: Record<string, string | undefined> = {};
  for (const key of envKeys) {
    saved[key] = process.env[key];
  }
  return saved;
}

function restoreEnv(saved: Record<string, string | undefined>): void {
  for (const key of envKeys) {
    if (saved[key] !== undefined) {
      process.env[key] = saved[key];
    } else {
      delete process.env[key];
    }
  }
}

describe("initModel", () => {
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    savedEnv = saveEnv();
  });

  afterEach(() => {
    restoreEnv(savedEnv);
  });

  test("when OPENAI_API_KEY is set → returns a ChatOpenAI instance", () => {
    process.env.OPENAI_API_KEY = "test-key";
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ZEITZEUGE_MODEL;

    const model = initModel();

    expect(model).toBeTruthy();
    expect(model.constructor.name).toBe("ChatOpenAI");
  });

  test("when only ANTHROPIC_API_KEY is set → returns a ChatAnthropic instance", () => {
    delete process.env.OPENAI_API_KEY;
    process.env.ANTHROPIC_API_KEY = "test-key";
    delete process.env.ZEITZEUGE_MODEL;

    const model = initModel();

    expect(model).toBeTruthy();
    expect(model.constructor.name).toBe("ChatAnthropic");
  });

  test("when both keys are set → prefers OpenAI (returns ChatOpenAI)", () => {
    process.env.OPENAI_API_KEY = "test-key";
    process.env.ANTHROPIC_API_KEY = "test-key";
    delete process.env.ZEITZEUGE_MODEL;

    const model = initModel();

    expect(model).toBeTruthy();
    expect(model.constructor.name).toBe("ChatOpenAI");
  });

  test("when neither key is set → throws with a helpful error message containing OPENAI_API_KEY and ANTHROPIC_API_KEY", () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ZEITZEUGE_MODEL;

    let err: Error | null = null;
    try {
      initModel();
    } catch (e) {
      err = e as Error;
    }
    expect(err).not.toBeNull();
    expect(err!.message).toContain("OPENAI_API_KEY");
    expect(err!.message).toContain("ANTHROPIC_API_KEY");
  });

  test("when ZEITZEUGE_MODEL override is set along with OPENAI_API_KEY → the model is initialized (doesn't throw)", () => {
    process.env.OPENAI_API_KEY = "test-key";
    delete process.env.ANTHROPIC_API_KEY;
    process.env.ZEITZEUGE_MODEL = "gpt-4o-mini";

    expect(() => initModel()).not.toThrow();
    const model = initModel();
    expect(model).toBeTruthy();
  });
});
