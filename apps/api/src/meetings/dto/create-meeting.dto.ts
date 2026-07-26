import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsString,
} from 'class-validator';

export class CreateMeetingDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsDateString()
  date: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  participants: string[];
}
