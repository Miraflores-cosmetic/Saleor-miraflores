import { IsString, MinLength, MaxLength } from 'class-validator';

/** Доступ к pay / abandon / status — short-lived HMAC с create. */
export class OrderPayAccessDto {
  @IsString()
  @MinLength(20)
  @MaxLength(512)
  payToken!: string;
}
