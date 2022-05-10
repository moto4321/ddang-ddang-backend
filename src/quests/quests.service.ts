import { Injectable, NotFoundException } from '@nestjs/common';
import { FeedRepository } from 'src/feeds/feeds.repository';
import { InjectRepository } from '@nestjs/typeorm';
import { CommentRepository } from 'src/comments/comments.repository';
import axios from 'axios';
import * as config from 'config';
import { CreateFeedDto } from 'src/feeds/dto/create-feed.dto';
import { QuestsRepository } from './quests.repository';
import { DongsRepository } from './dongs.repository';

const mapConfig = config.get('map');
const KAKAO_BASE_URL = mapConfig.kakaoBaseUrl;
const REST_API_KEY = mapConfig.kakaoApiKey;
const JUSO_CONFIRM_KEY = mapConfig.josoConfirmKey;
const JUSO_BASE_URL = mapConfig.jusoBaseUrl;

@Injectable()
export class QuestsService {
  constructor(
    @InjectRepository(FeedRepository)
    private feedRepository: FeedRepository,
    private commentRepository: CommentRepository,
    private questsRepository: QuestsRepository,
    private dongsRepository: DongsRepository
  ) {}

  // feedQuest(img: string[], content: string) {
  feedQuest(createFeedDto: CreateFeedDto) {
    // const feedText = content['content'];
    console.log(createFeedDto);
    const { img, content } = createFeedDto;
    // return this.feedRepository.feedQuest(img, feedText);
    return this.feedRepository.feedQuest(img, content);
  }

  /*
   * 퀘스트 조회 프로세스 => 좌표 기준으로 주소 조회, 주소 및 날짜 기준으로 DB 조회
   * DB에 동 데이터 있는 경우 => 퀘스트, 완료여부 조인해서 클라이언트로 발송
   * DB에 동 데이터가 없는 경우 => 동 및 퀘스트 데이터 DB에 추가하고 클라이언트로 발송
   */

  /* 위도(lat), 경도(lng) 기준으로 우리 마을 퀘스트 조회 */
  async getAll(lat: number, lng: number) {
    const kakaoAddress = await this.getAddressName(lat, lng);
    const address = `${kakaoAddress.regionSi} ${kakaoAddress.regionGu} ${kakaoAddress.regionDong}`;

    // TODO: 2. DB에서 퀘스트 조회
    let dong = await this.dongsRepository.findByAddrs(kakaoAddress);
    if (dong) {
      // 퀘스트, 완료여부 조인해서 클라이언트로 발송
      return await this.questsRepository.findAll(dong);
    }

    /* 동 및 퀘스트 데이터 DB에 추가하고 클라이언트로 발송 */
    const { totalCount, pageCount } = await this.getDongData(address);
    console.time('API req-res time');
    const quests = await this.createQuests(totalCount, pageCount, address);
    console.timeEnd('API req-res time');

    // 동 DB를 생성합니다
    // return dong 객체 (id 불포함)
    await this.dongsRepository.createAndSave(kakaoAddress);

    // return dong 모델 (id 포함)
    dong = await this.dongsRepository.findByAddrs(kakaoAddress);
    console.log(dong);

    // 퀘스트 DB 생성 하고 결과 return
    console.time('abc');
    await Promise.all([
      ...quests.map(async (quest) => {
        return await this.questsRepository.createAndSave({ ...quest, dong });
      }),
    ]);
    console.timeEnd('abc');

    return await this.questsRepository.findAll(dong);
  }

  /* 주소 데이터 얻어오기 */
  /**
   * @param {number} lat - 위도
   * @param {number} lng - 경도
   * @returns {object} - { 시, 구, 동 }
   */
  async getAddressName(lat, lng) {
    try {
      const res = await axios.get(
        `${KAKAO_BASE_URL}/geo/coord2address.json?x=${lng}&y=${lat}&input_coord=WGS84`,
        { headers: { Authorization: `KakaoAK ${REST_API_KEY}` } }
      );
      const { address } = res.data.documents[0];
      const region_1depth = address.region_1depth_name;
      const region_2depth = address.region_2depth_name;
      const region_3depth = address.region_3depth_name;

      return {
        regionSi: region_1depth,
        regionGu: region_2depth,
        regionDong: region_3depth,
      };
    } catch (error) {
      console.log(error.message);
    }
  }

  /* 특정 동의 개요 얻어오기 */
  /**
   * @param {string} address - "시 구 동"
   * @returns {object} - { 전체 주소 개수, 페이지수 }
   */
  async getDongData(address) {
    try {
      const res = await axios.get(
        `${JUSO_BASE_URL}?currentPage=1&countPerPage=10&keyword=${encodeURI(
          address
        )}&confmKey=${JUSO_CONFIRM_KEY}&resultType=json`
      );
      const { totalCount } = res.data.results.common;
      const pageCount = Math.ceil(totalCount / 100);
      // const lastPage = 25;
      return { totalCount, pageCount };
    } catch (error) {
      console.log(error.message);
    }
  }

  /* 퀘스트 만들기 */
  /**
   * @param {number} totalCount - 전체 주소 개수
   * @param {number} paegCount - 전체 페이지 수
   * @param {string} address - "시 구 동"
   * @returns {array} - [ 퀘스트 ]
   */
  async createQuests(totalCount, paegCount, address) {
    const limitsPerRequest = 20;
    let questsCoords = [];
    for (
      let startPage = 1;
      startPage < paegCount;
      startPage += limitsPerRequest
    ) {
      const lastPage =
        startPage + limitsPerRequest < paegCount
          ? startPage + limitsPerRequest
          : paegCount + 1;
      questsCoords = [
        ...questsCoords,
        ...(await this.getQuestsCoords(
          totalCount,
          startPage,
          lastPage,
          address
        )),
      ];
    }

    const quests = questsCoords.map((coords) => {
      const type = Math.floor(Math.random() * 3);
      return { ...coords, type };
    });

    return quests;
  }

  /* 퀘스트를 만들기 위한 좌표값 얻기 */
  /**
   * @param {number} totalCount - 전체 주소 개수
   * @param {number} startPage - 시작 페이지
   * @param {number} lastPage - 마지막 페이지
   * @param {string} address - "시 구 동"
   * @returns {array} - [ { lat, lng } ]
   */
  async getQuestsCoords(totalCount, startPage, lastPage, address) {
    const addrIndex = [];
    for (let curPage = startPage; curPage < lastPage; curPage++) {
      const idx =
        curPage !== lastPage
          ? Math.floor(Math.random() * 100) + 1
          : Math.floor(Math.random() * (totalCount % 100)) + 1;
      addrIndex.push({ curPage: curPage, idx });
    }

    /* 각 페이지마다 랜덤 idx로 상세주소 얻기 */
    const resRoadAddr = await Promise.all([
      ...addrIndex.map(({ curPage, idx }) =>
        this.getRoadAddress(curPage, address, idx)
      ),
    ]);
    /* 상세주소에 해당하는 좌표값 얻기 */
    const resCoordsArr = await Promise.all([
      ...resRoadAddr
        .filter((addr) => addr)
        .map((roadAddr) => this.getCoords(roadAddr)),
    ]);
    return resCoordsArr;
  }

  /* 상세주소 얻어오기 */
  /**
   * @param {number} curPage - 현재 페이지 번호
   * @param {string} address - "시 구 동"
   * @param {number} idx - 인덱스(1~100 랜덤)
   * @returns {string} - 상세주소 (ex. 서울특별시 강남구 언주로63길 20(역삼동))
   */
  async getRoadAddress(curPage, address, idx) {
    try {
      const res = await axios.get(
        `${JUSO_BASE_URL}?currentPage=${curPage}&countPerPage=100&keyword=${encodeURI(
          address
        )}&confmKey=${JUSO_CONFIRM_KEY}&resultType=json`
      );
      return res.data.results.juso[idx].roadAddr;
    } catch (error) {
      console.log(`getRoadAddress: ${error.message}`);
    }
  }

  /* 좌표값 얻어오기 */
  /**
   * @param {string} roadAddr - 상세주소 (ex. 서울특별시 강남구 언주로63길 20(역삼동))
   * @returns {object} - { 위도, 경도 }
   */
  async getCoords(roadAddr) {
    try {
      const res = await axios.get(
        `${KAKAO_BASE_URL}/search/address.json?query=${encodeURI(roadAddr)}`,
        {
          headers: {
            Authorization: `KakaoAK ${REST_API_KEY}`,
          },
        }
      );
      const lat = res.data.documents[0].y;
      const lng = res.data.documents[0].x;
      return { lat, lng };
    } catch (error) {
      console.log(`getCoords: ${error.message}`);
    }
  }

  async getOne(id: number) {
    const quest = await this.questsRepository.findOneBy(id);
    if (!quest) {
      throw new NotFoundException({
        ok: false,
        message: '퀘스트를 찾을 수 없습니다.',
      });
    }
    return quest;
  }
}
