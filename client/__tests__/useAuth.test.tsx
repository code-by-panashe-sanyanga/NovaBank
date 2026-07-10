import { render, screen, waitFor, act } from "@testing-library/react";
import { AuthProvider, useAuth } from "../hooks/useAuth";
import api from "../services/api";

jest.mock("../services/api", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

const mockedApi = api as unknown as { get: jest.Mock; post: jest.Mock };

function Probe() {
  const { user, loading, login, logout } = useAuth();
  if (loading) return <p>loading</p>;
  return (
    <div>
      <p data-testid="user">{user ? user.email : "none"}</p>
      <button type="button" onClick={() => login("tok", {
        id: 1,
        fullName: "Alex",
        email: "alex@example.com",
        role: "CUSTOMER",
      })}>
        login
      </button>
      <button type="button" onClick={() => logout()}>
        logout
      </button>
    </div>
  );
}

describe("useAuth", () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  it("starts logged out when there is no token", async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId("user").textContent).toBe("none"));
  });

  it("restores the session from localStorage", async () => {
    localStorage.setItem("novabank_token", "abc");
    mockedApi.get.mockResolvedValue({
      data: {
        user: {
          id: 1,
          fullName: "Alex",
          email: "alex@example.com",
          role: "CUSTOMER",
        },
      },
    });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    await waitFor(() =>
      expect(screen.getByTestId("user").textContent).toBe("alex@example.com")
    );
  });

  it("login stores the token and logout clears it", async () => {
    mockedApi.post.mockResolvedValue({});
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId("user").textContent).toBe("none"));

    await act(async () => {
      screen.getByText("login").click();
    });
    expect(localStorage.getItem("novabank_token")).toBe("tok");
    expect(screen.getByTestId("user").textContent).toBe("alex@example.com");

    await act(async () => {
      screen.getByText("logout").click();
    });
    expect(localStorage.getItem("novabank_token")).toBeNull();
  });
});
