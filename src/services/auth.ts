import jwt from 'jsonwebtoken';
import { IncomingMessage } from 'http';
import { URL } from 'url';
import Logger from '../utils/logger';

/**
 * Authentication service for managing JWT verification
 */
class AuthService {
  private static readonly JWT_SECRET = process.env.JWT_SECRET || '';

  /**
   * Validates that the JWT secret is configured
   */
  public static validateJwtSecret(): void {
    if (!this.JWT_SECRET && process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET environment variable is not set');
    }
    
    if (!this.JWT_SECRET && process.env.NODE_ENV !== 'production') {
      Logger.warn('JWT_SECRET environment variable is not set, using default for development!');
      // We don't actually modify the readonly constant, but we'll use a default in verifyToken
    }
  }

  /**
   * Extract the JWT token from the WebSocket request
   * Accepts token either in query param or Authorization header
   */
  public static extractToken(request: IncomingMessage): string | null {
    try {
      // First try to get from query parameter
      if (request.url) {
        const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
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
    } catch (error) {
      Logger.error(`Failed to extract token: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return null;
    }
  }

  /**
   * Verify a JWT token and return the decoded payload or null if invalid
   */
  public static verifyToken(token: string): any {
    try {
      // Use a default secret in development mode if not specified
      const secret = this.JWT_SECRET || (process.env.NODE_ENV !== 'production' ? 'development-secret-key' : '');
      
      if (!secret) {
        throw new Error('No JWT secret available for verification');
      }
      
      // Verify the token with our secret
      const decoded = jwt.verify(token, secret);
      return decoded;
    } catch (error) {
      // Don't leak specific error details to logs in production
      if (process.env.NODE_ENV !== 'production') {
        Logger.error(`Token verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      } else {
        Logger.error('Token verification failed');
      }
      return null;
    }
  }

  /**
   * Authenticate a WebSocket connection request
   * Returns the decoded token payload if valid, null otherwise
   */
  public static authenticateWebSocketRequest(request: IncomingMessage): any {
    // Extract token from request
    const token = this.extractToken(request);
    if (!token) {
      Logger.warn(`WebSocket connection attempt without token from ${request.socket.remoteAddress}`);
      return null;
    }

    // Verify the token
    const decoded = this.verifyToken(token);
    if (!decoded) {
      Logger.warn(`WebSocket connection attempt with invalid token from ${request.socket.remoteAddress}`);
      return null;
    }

    // Log successful authentication
    Logger.info(`WebSocket client authenticated: ${request.socket.remoteAddress}`);
    return decoded;
  }

  /**
   * Generate a JWT token for testing or other purposes
   */
  public static generateToken(payload: object = { scope: 'client' }, expiresInSeconds: number = 3600): string {
    const secret = this.JWT_SECRET;
    if (!secret) {
      Logger.error('JWT_SECRET is not available for token generation.');
      throw new Error('JWT secret is missing');
    }
    const options: jwt.SignOptions = { expiresIn: expiresInSeconds };
    return jwt.sign(payload, secret, options);
  }
}

export default AuthService; 