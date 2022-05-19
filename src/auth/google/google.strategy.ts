import { JwtService } from '@nestjs/jwt';
import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile, VerifyCallback } from 'passport-google-oauth20';
import { PlayersService } from '../../players/players.service';
import { AuthService } from '../auth.service';
import * as config from 'config';
const jwtConfig = config.get('jwt');

const googleConfig = config.get('google');

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  private logger = new Logger('google');
  JwtService: any;
  constructor(
    private readonly playersService: PlayersService,
    private readonly authService: AuthService,
    private readonly jwtService: JwtService
  ) {
    super({
      clientID: googleConfig.clientId,
      clientSecret: googleConfig.clientSecret,
      callbackURL: 'http://localhost:3005/api/players/googleauth',
      passReqToCallback: true,
      scope: ['profile', 'email'],
    });
  }
  // 인증이 되어 있나 감시
  async validate(
    accessToken: string,
    refreshToken: string,
    user: any,
    req: any,
    done: VerifyCallback
  ): Promise<any> {
    const { id, emails, displayName, photos } = req;
    const isJoin = await this.playersService.findByEmail({
      email: emails[0].value,
    });

    if (!isJoin) {
      this.logger.verbose(`${displayName}님이 구글로 회원가입을 진행합니다.`);
      const payload = {
        email: emails[0].value,
        password: id + displayName,
        nickname: displayName,
        mbti: 'mbti',
        profileImg: photos[0].value,
        provider: 'google',
        providerId: id,
        // providerId: Number(String(id).substring(0, 19)),
        currentHashedRefreshToken: refreshToken,
      };

      //가입
      const joinGame = await this.playersService.signup(payload);
      console.log(joinGame);
    }

    const player = {
      id,
      nickname: displayName,
      profileImg: photos[0].value,
      email: emails[0].value,
      refreshToken,
    };

    // 로그인 성공
    done(null, player);
  }
}
