import axios from "axios";

// all requests go through this one axios instance so the base URL and
// auth header logic only live in one place
const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api",
});

// attach the JWT to every request if we have one.
// the window check is needed because Next.js also runs this file on the
// server where localStorage doesn't exist
api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("novabank_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// if the API ever says our token is dead, clear it and go back to login
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      error.response?.status === 401 &&
      typeof window !== "undefined" &&
      // don't redirect if we're already on an auth page (e.g. wrong password)
      !window.location.pathname.startsWith("/login") &&
      !window.location.pathname.startsWith("/register")
    ) {
      localStorage.removeItem("novabank_token");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export default api;

// pull a readable message out of an axios error for showing in the UI
export function errorMessage(err: unknown): string {
  if (axios.isAxiosError(err) && err.response?.data?.error) {
    return err.response.data.error;
  }
  return "Something went wrong, please try again";
}
