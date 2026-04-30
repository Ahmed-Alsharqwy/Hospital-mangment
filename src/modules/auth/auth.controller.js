// src/modules/auth/auth.controller.js
const authService = require('./auth.service');
const { ok, created } = require('../../utils/response');

async function login(req, res) {
  const data = await authService.login(req.body, req);
  ok(res, data, 'Login successful');
}

async function refresh(req, res) {
  const data = await authService.refreshTokens(req.body.refresh_token, req);
  ok(res, data, 'Token refreshed');
}

async function logout(req, res) {
  await authService.logout(req.body.refresh_token, req.user.id, req);
  ok(res, null, 'Logged out successfully');
}

async function createUser(req, res) {
  const user = await authService.createUser(req.body, req.user);
  created(res, user, 'User created successfully');
}

async function changePassword(req, res) {
  await authService.changePassword(req.body, req.user.id);
  ok(res, null, 'Password changed successfully');
}

async function getMe(req, res) {
  ok(res, req.user, 'Profile retrieved');
}

module.exports = { login, refresh, logout, createUser, changePassword, getMe };
