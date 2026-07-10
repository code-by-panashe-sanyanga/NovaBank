import "@testing-library/jest-dom";

// next/router is used by auth + Protected
jest.mock("next/router", () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    pathname: "/",
    query: {},
  }),
}));
