import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { QUIZ_EVENT_TYPES, QUIZ_ZONES } from '../quiz-events.constants';

export class TrackQuizEventItemDto {
  @IsString()
  @MinLength(8)
  @MaxLength(80)
  sessionId!: string;

  @IsIn([...QUIZ_EVENT_TYPES])
  type!: (typeof QUIZ_EVENT_TYPES)[number];

  @IsOptional()
  @IsIn([...QUIZ_ZONES])
  zone?: (typeof QUIZ_ZONES)[number] | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  stepKey?: string | null;

  @IsOptional()
  @IsObject()
  meta?: Record<string, unknown> | null;
}

export class TrackQuizEventsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => TrackQuizEventItemDto)
  events!: TrackQuizEventItemDto[];
}
