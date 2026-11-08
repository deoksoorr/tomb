// 근접 툴팁 대상 묘비 추적. 묘비 목록이 바뀌면(이장·삭제) 지금 대상이 사라졌는지 바로 알려 준다.
// (예전엔 목록이 바뀌면 대상만 null로 지웠는데, 다음 프레임에도 가까운 묘비가 없으면 "바뀐 게 없다"로 보고
//  툴팁·grave:near가 그대로 남았다 → 삭제된 묘비 이름표가 계속 보이던 버그)

export class NearTracker {
  id: string | null = null;
  private dirty = false;

  /** 목록이 바뀜: 다음 프레임에 무조건 다시 그리게 하고, 지금 대상이 사라졌으면 true (바로 숨겨야 한다) */
  invalidate(exists: (id: string) => boolean): boolean {
    this.dirty = true;
    if (this.id !== null && !exists(this.id)) {
      this.id = null;
      return true;
    }
    return false;
  }

  /** 이 묘비가 지워졌다고 바로 알게 됨 (내가 이장/삭제): 대상이면 true */
  drop(id: string): boolean {
    if (this.id !== id) return false;
    this.id = null;
    this.dirty = true;
    return true;
  }

  /** 매 프레임: 대상이 바뀌었거나 다시 그려야 하면 true */
  next(id: string | null): boolean {
    if (id === this.id && !this.dirty) return false;
    this.id = id;
    this.dirty = false;
    return true;
  }

  /** 툴팁을 다시 그리게만 한다 (내 묘비 표시 변경 등) */
  touch(): void {
    this.dirty = true;
  }

  clear(): void {
    this.id = null;
    this.dirty = false;
  }
}
