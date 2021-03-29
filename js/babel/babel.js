const fs = require('fs');
const path = require('path');

//esprima对某些js不能解析，所以直接用babel
//直接npm install
const bp = require("@babel/parser");
const tp = require('@babel/types')
const generate = require('@babel/generator').default
const traverse = require('@babel/traverse').default;
const template = require('@babel/template').default

function parse(src, des, file){
    ast_path = extract_name(file);
    ast_path = path.join(des, ast_path);
    js_path = path.join(src, file);
    code = read_file(js_path);

    try {
        bparse_and_write(code, ast_path);
    } catch (err) {
        err_msg = '[!] Error - ' + js_path + '\n';
        err_msg += err
        console.log(err_msg);
    }
}

const visitor = {
    enter(path) {
        //如果是标识符则打印
        if (tp.isIdentifier(path.node)) {
          console.log('Identifier!')
        }
    },
    //记录函数表达式或者箭头函数
    'FunctionExpression|ArrowFunctionExpression' () {
        console.log('A function expression or a arrow function expression!')
    }
}


const strNode = tp.stringLiteral('mirror')
const cvisitor = {
    //反转标识符
    Identifier (path) {
        path.node.name = path.node.name.split('').reverse().join('')
    }, 
    //修改return值
    ReturnStatement (path) {
        path.traverse({
            Identifier(cpath){
                cpath.replaceWith(strNode)
            }
        })
    },
    //修改函数表达式为箭头表达式
    FunctionDeclaration(path) {
        const { params, body, id }  = path.node
        const exp = tp.variableDeclaration('const', [
            tp.variableDeclarator(id, tp.arrowFunctionExpression(params, body))
        ])

        path.replaceWith(exp) 
        //path
        // 属性
        // node: 当前的节点
        // parent: 当前节点的父节点
        // parentPath: 父节点的path对象

        // 方法
        // get(): 获取子节点的路径
        // find(): 查找特定的路径，需要传一个callback，参数是nodePath，当callback返回真值时，将这个nodePath返回
        // findParent(): 查找特定的父路径
        // getSibling(): 获取兄弟路径
        // replaceWith(): 用单个AST节点替换单个节点
        // replaceWithMultiple(): 用多个AST节点替换单个节点
        // replaceWithSourceString(): 用字符串源码替换节点
        // insertBefore(): 在节点之前插入
        // insertAfter(): 在节点之后插入
        // remove(): 删除节点

    }
}

//使用模板进行修改
const tcvisitor = {
    FunctionDeclaration(path) {
        const temp = template(`
            if(something) {
                NORMAL_RETURN
            } else {
                return 'nothing'
            }
        `)
        const returnNode = path.node.body.body[0]
        const tempAst = temp({
            NORMAL_RETURN: returnNode
        })
        path.node.body.body[0] = tempAst
    }
}

function bparse_and_write(code, ast_path) {
    //ast = esprima.parse(code);
    ast = bp.parse(code, {
        sourceType: 'module',
        plugins: [
            "classProperties",
            "flow",
        ]
    });
    traverse(ast, cvisitor)
    const transformedCode = generate(ast).code
    ast = JSON.stringify(ast, null, 2);
    fs.writeFileSync(ast_path, ast);
}

function extract_name(path){
    idx = path.lastIndexOf('.');
    name = path.slice(0, idx) + '.json';
    return name;
}

function parse_single(js_path) {
    js_path = js_path.trim();
    ast_path = extract_name(js_path);
    code = fs.readFileSync(js_path, 'utf8');

    try {
        bparse_and_write(code, ast_path);
    } catch (err) {
        err_msg = '[*]Error: ' + js_path + '\n' + err;
        process.stdout.write(err_msg);
    }
}

if (process.argv.length == 2) {
    src_file = process.argv[2];
    parse_single(src_file);
}

//https://github.com/tzcteddy/knows-point/blob/master/ES6/%E6%B7%B1%E5%85%A5babel.md
//https://github.com/starkwang/the-super-tiny-compiler-cn/blob/master/super-tiny-compiler-chinese.js