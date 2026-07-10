import { render, screen, waitFor } from "@testing-library/react";
import Protected from "../components/Protected";
import { useAuth } from "../hooks/useAuth";

const replace = jest.fn();

jest.mock("next/router", () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace,
    pathname: "/dashboard",
    query: {},
  }),
}));

jest.mock("../hooks/useAuth");

const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

describe("Protected", () => {
  beforeEach(() => {
    replace.mockClear();
  });

  it("shows a spinner while auth is loading", () => {
    mockedUseAuth.mockReturnValue({
      user: null,
      loading: true,
      login: jest.fn(),
      logout: jest.fn(),
    });

    const { container } = render(
      <Protected>
        <p>secret</p>
      </Protected>
    );
    expect(screen.queryByText("secret")).not.toBeInTheDocument();
    expect(container.querySelector(".animate-spin")).toBeTruthy();
  });

  it("redirects to login when there is no user", async () => {
    mockedUseAuth.mockReturnValue({
      user: null,
      loading: false,
      login: jest.fn(),
      logout: jest.fn(),
    });

    render(
      <Protected>
        <p>secret</p>
      </Protected>
    );

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  });

  it("renders children for an authenticated user", () => {
    mockedUseAuth.mockReturnValue({
      user: {
        id: 1,
        fullName: "Alex",
        email: "alex@example.com",
        role: "CUSTOMER",
      },
      loading: false,
      login: jest.fn(),
      logout: jest.fn(),
    });

    render(
      <Protected>
        <p>secret</p>
      </Protected>
    );
    expect(screen.getByText("secret")).toBeInTheDocument();
  });
});
