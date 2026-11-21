import { test } from "node:test";
import assert from "node:assert/strict";
import { backendOrigin } from "../serviceUrl.ts";

test("hosted clients use the HTTPS page origin without leaking the development port", () => {
  assert.equal(backendOrigin("https://pb.example.com/play?room=1", false), "https://pb.example.com");
  assert.equal(backendOrigin("http://localhost:8088/", false), "http://localhost:8088");
});

test("Vite development retains the backend port, including IPv6 loopback", () => {
  assert.equal(backendOrigin("http://localhost:8000/", true), "http://localhost:8090");
  assert.equal(backendOrigin("http://[::1]:8000/", true), "http://[::1]:8090");
});
