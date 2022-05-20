import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  CreateBodyDto,
  EmailDto,
  NicknameDto,
  UpdateInfoDto,
} from './dto/create-player.dto';
import { Player } from './entities/player.entity';
import { PlayerRepository } from './players.repository';
import * as bcrypt from 'bcrypt';

@Injectable()
export class PlayersService {
  constructor(
    @InjectRepository(PlayerRepository)
    private playersRepository: PlayerRepository
  ) {}

  // 플레이어 생성
  async signup(createPlayerDto: CreateBodyDto): Promise<Player> {
    try {
      const {
        email,
        password,
        nickname,
        mbti,
        profileImg,
        provider,
        providerId,
        currentHashedRefreshToken,
      } = createPlayerDto;

      const hashedPassword = await bcrypt.hash(password, 10);
      const createPlayer = await this.playersRepository.createPlayer({
        email,
        nickname,
        password: hashedPassword,
        mbti,
        profileImg,
        provider,
        providerId,
        currentHashedRefreshToken,
      });
      return createPlayer;
    } catch (err) {
      return err.message;
    }
  }

  async findByNickname(nicknameDto: NicknameDto): Promise<boolean> {
    try {
      const { nickname } = nicknameDto;

      const result = await this.playersRepository.findByNickname({ nickname });

      if (!result) {
        return false;
      }
      return true;
    } catch (err) {
      return err.message;
    }
  }

  // 이멜일로 찾기
  async findByEmail(emailDto: EmailDto): Promise<boolean> {
    try {
      const { email } = emailDto;
      const players = await this.playersRepository.findByEmail({ email });

      if (!players) {
        return false;
      }
      return true;
    } catch (err) {
      console.log(err.message);
    }
  }

  async getDataByEmail(emailDto: EmailDto): Promise<any> {
    try {
      const { email } = emailDto;
      const result = await this.playersRepository.findOne({
        where: { email },
        select: ['profileImg'],
      });

      if (!result) {
        return { ok: false, message: result };
      }
      return result;
    } catch (err) {
      console.log(err.message);
    }
  }

  async getRefreshToken(playerId: number): Promise<string> {
    try {
      const result = await this.playersRepository.checkRefreshToken(playerId);
      return result;
    } catch (err) {
      console.log(err.message);
    }
  }

  // nickname 변경하기
  async editPlayer(updateInforDto: UpdateInfoDto): Promise<object> {
    try {
      const { email, nickname, profileImg } = updateInforDto;

      const result = await this.playersRepository.updateNickname({
        email,
        profileImg,
        nickname,
      });
      return result;
    } catch (err) {
      console.log(err.message);
    }
  }

  async mypageInfo(playerId: number): Promise<object> {
    const result = await this.playersRepository.mypageInfo(playerId);
    return result;
  }
}
