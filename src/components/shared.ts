import type { Scope } from '@babel/traverse'

// 合法标识符校验（排除关键字）
export function identifierIsVaild(value: string) {
    const keywords = (
        'break,extends,this,catch,for,case,finally,throw,try,class,function,typeof,const,if,var,continue,' +
        'import,void,debugger,in,white,default,instanceof,with,delete,net,yield,do,return,else,super,export,switch,' +
        'enum,implements,package,public,interface,private,static,protected,let,' +
        // 严格模式保留名：不能作为绑定名/赋值目标（形参改名成它们会产出非法代码）
        'arguments,eval'
    ).split(',')
    const namedRegex = /^[a-zA-Z_$][0-9a-zA-Z_$]*$/
    return !keywords.includes(value) && namedRegex.test(value)
}

// 压缩名：1-2 字符短名，或 _ 开头的混淆名（_0x、_$ 等）
export function isMinifiedName(name: string): boolean {
    return /^[a-zA-Z0-9_$]{1,2}$/.test(name) || /^_[a-zA-Z0-9$]+/.test(name)
}

// 可读名：非压缩名、长度 >= 3、合法标识符
export function isReadableName(name: string): boolean {
    return name.length >= 3 && identifierIsVaild(name) && !isMinifiedName(name)
}

// 将 oldName 重命名为 desiredName；名字被占用时追加数字后缀（name1、name2...）
// 返回实际使用的名字（oldName 已是 desiredName 时原样返回）
export function renameToDesired(
    scope: Scope,
    oldName: string,
    desiredName: string,
    reservedNames: string[] = []
): string {
    if (oldName === desiredName) {
        return desiredName
    }
    const binding = scope.getBinding(oldName)
    if (!binding) {
        return desiredName
    }
    const targetScope = binding.scope
    const taken = (name: string) =>
        name !== oldName &&
        (!!targetScope.getBinding(name) || reservedNames.includes(name))
    let name = desiredName
    let suffix = 1
    while (taken(name)) {
        name = `${desiredName}${suffix++}`
    }
    targetScope.rename(oldName, name)
    return name
}
