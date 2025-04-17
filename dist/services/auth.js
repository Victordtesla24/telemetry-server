"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const url_1 = require("url");
const logger_1 = __importDefault(require("../utils/logger"));
/**
 * Authentication service for managing JWT verification
 */
class AuthService {
    /**
     * Validates that the JWT secret is configured
     */
    static validateJwtSecret() {
        if (!this.JWT_SECRET && process.env.NODE_ENV === 'production') {
            throw new Error('JWT_SECRET environment variable is not set');
        }
        if (!this.JWT_SECRET && process.env.NODE_ENV !== 'production') {
            logger_1.default.warn('JWT_SECRET environment variable is not set, using default for development!');
            // We don't actually modify the readonly constant, but we'll use a default in verifyToken
        }
    }
    /**
     * Extract the JWT token from the WebSocket request
     * Accepts token either in query param or Authorization header
     */
    static extractToken(request) {
        try {
            // First try to get from query parameter
            if (request.url) {
                const url = new url_1.URL(request.url, `http://${request.headers.host || 'localhost'}`);
                const tokenParam = url.searchParams.get('token');
                if (tokenParam) {
                    return tokenParam;
                }
            }
            // Then try to get from auth header
            const authHeader = request.headers.authorization;
            if (authHeader && authHeader.startsWith('Bearer ')) {
                return authHeader.substring(7); // Remove 'Bearer ' prefix
            }
            return null;
        }
        catch (error) {
            logger_1.default.error(`Failed to extract token: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return null;
        }
    }
    /**
     * Verify a JWT token and return the decoded payload or null if invalid
     */
    static verifyToken(token) {
        try {
            // Use a default secret in development mode if not specified
            const secret = this.JWT_SECRET || (process.env.NODE_ENV !== 'production' ? 'development-secret-key' : '');
            if (!secret) {
                throw new Error('No JWT secret available for verification');
            }
            // Verify the token with our secret
            const decoded = jsonwebtoken_1.default.verify(token, secret);
            return decoded;
        }
        catch (error) {
            // Don't leak specific error details to logs in production
            if (process.env.NODE_ENV !== 'production') {
                logger_1.default.error(`Token verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
            else {
                logger_1.default.error('Token verification failed');
            }
            return null;
        }
    }
    /**
     * Authenticate a WebSocket connection request
     * Returns the decoded token payload if valid, null otherwise
     */
    static authenticateWebSocketRequest(request) {
        // Extract token from request
        const token = this.extractToken(request);
        if (!token) {
            logger_1.default.warn(`WebSocket connection attempt without token from ${request.socket.remoteAddress}`);
            return null;
        }
        // Verify the token
        const decoded = this.verifyToken(token);
        if (!decoded) {
            logger_1.default.warn(`WebSocket connection attempt with invalid token from ${request.socket.remoteAddress}`);
            return null;
        }
        // Log successful authentication
        logger_1.default.info(`WebSocket client authenticated: ${request.socket.remoteAddress}`);
        return decoded;
    }
    /**
     * Generate a test JWT token for development/testing
     */
    static generateTestToken(payload = { userId: 'test-user' }) {
        if (process.env.NODE_ENV === 'production') {
            throw new Error('Cannot generate test tokens in production environment');
        }
        // Use a default secret in development mode if not specified
        const secret = this.JWT_SECRET || 'development-secret-key';
        return jsonwebtoken_1.default.sign(payload, secret, { expiresIn: '1h' });
    }
}
AuthService.JWT_SECRET = process.env.JWT_SECRET || '';
exports.default = AuthService;
