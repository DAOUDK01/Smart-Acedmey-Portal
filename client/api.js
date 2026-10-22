"use strict";

const api = {
  get: async () => ({ data: {}, status: 200 }),
  post: async () => ({ data: {}, status: 200 }),
  put: async () => ({ data: {}, status: 200 }),
  delete: async () => ({ data: {}, status: 200 }),
  interceptors: {
    request: { use: () => {} },
    response: { use: () => {} },
  },
};

const login = async () => ({ success: true, token: "mock-token" });
const logout = async () => ({ success: true });
const getUserProfile = async () => ({ id: "123", name: "User" });

module.exports = { api, login, logout, getUserProfile };
